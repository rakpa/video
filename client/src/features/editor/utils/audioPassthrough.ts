import { createFile, MP4BoxBuffer } from 'mp4box';

/** Encoded AAC packets for a trimmed range, ready to be copied into the export. */
export interface AacTrackSlice {
  sampleRate: number;
  channels: number;
  /** AudioSpecificConfig for the decoder. */
  description: Uint8Array;
  packets: Array<{ data: Uint8Array; tsMicros: number; durMicros: number }>;
}

const READ_CHUNK = 4 * 1024 * 1024;
const AAC_FREQS = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** Minimal AAC-LC AudioSpecificConfig when the file's own one cannot be read. */
function buildAudioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const idx = Math.max(0, AAC_FREQS.indexOf(sampleRate));
  return new Uint8Array([(2 << 3) | (idx >> 1), ((idx & 1) << 7) | (channels << 3)]);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function findDecoderSpecificInfo(trak: any): Uint8Array | null {
  try {
    const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
    const esd = entry?.esds?.esd;
    const walk = (d: any): Uint8Array | null => {
      if (!d) return null;
      if (d.tag === 5 && d.data && d.data.length > 0) return new Uint8Array(d.data);
      for (const c of d.descs ?? []) {
        const found = walk(c);
        if (found) return found;
      }
      return null;
    };
    return walk(esd);
  } catch {
    return null;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Pull the AAC packets between startSec and endSec straight out of an MP4/MOV
 * file — no decoding and no re-encoding, so it is fast and memory-light even on
 * phones (decoding a whole video's audio with Web Audio stalled iOS exports).
 * Returns null when the file has no AAC track or cannot be parsed in time.
 */
export async function extractAacSlice(
  file: File,
  startSec: number,
  endSec: number,
  signal?: AbortSignal,
  timeoutMs = 45_000,
): Promise<AacTrackSlice | null> {
  const deadline = Date.now() + timeoutMs;
  try {
    const mp4 = createFile();
    let trackId = -1;
    let slice: AacTrackSlice | null = null;
    let failed = false;
    let passedEnd = false;

    mp4.onError = () => {
      failed = true;
    };
    mp4.onReady = (info) => {
      const track = info.audioTracks?.find((t) => (t.codec ?? '').toLowerCase().startsWith('mp4a'));
      if (!track || !track.audio) {
        failed = true;
        return;
      }
      trackId = track.id;
      const sampleRate = track.audio.sample_rate;
      const channels = Math.max(1, Math.min(2, track.audio.channel_count || 2));
      slice = {
        sampleRate,
        channels,
        description:
          findDecoderSpecificInfo(mp4.getTrackById(track.id)) ?? buildAudioSpecificConfig(sampleRate, channels),
        packets: [],
      };
      mp4.setExtractionOptions(track.id, null, { nbSamples: 400 });
      mp4.start();
    };
    mp4.onSamples = (id, _user, samples) => {
      if (id !== trackId || !slice) return;
      for (const s of samples) {
        const t = s.cts / s.timescale;
        const d = s.duration / s.timescale;
        if (t >= endSec) {
          passedEnd = true;
          break;
        }
        if (t + d <= startSec || !s.data) continue;
        slice.packets.push({
          data: new Uint8Array(s.data),
          tsMicros: Math.max(0, Math.round((t - startSec) * 1_000_000)),
          durMicros: Math.round(d * 1_000_000),
        });
      }
      const last = samples[samples.length - 1];
      if (last) mp4.releaseUsedSamples(id, last.number + 1);
    };

    let offset = 0;
    let guard = 0;
    while (offset < file.size && !failed && !passedEnd) {
      if (signal?.aborted) return null;
      if (Date.now() > deadline || guard++ > 20_000) return null;
      const chunk = await file.slice(offset, offset + READ_CHUNK).arrayBuffer();
      if (chunk.byteLength === 0) break;
      const next = mp4.appendBuffer(MP4BoxBuffer.fromArrayBuffer(chunk, offset));
      // mp4box reports where it wants to read next (it skips data it does not need).
      offset = typeof next === 'number' && next > offset ? next : offset + chunk.byteLength;
    }
    if (!failed) mp4.flush();

    const result = slice as AacTrackSlice | null;
    if (failed || !result || result.packets.length === 0) return null;
    return result;
  } catch {
    return null;
  }
}
