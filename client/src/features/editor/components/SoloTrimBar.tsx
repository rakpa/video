import { useMemo, useRef, useState } from 'react';
import type { EditorClip } from '../types';
import { formatEditorTime } from '../utils/time';

interface Props {
  clip: EditorClip;
  currentTime: number;
  playing: boolean;
  onSeek: (time: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onTogglePlay: () => void;
  onRemove?: () => void;
}

/**
 * Solo trim experience: one clear "keep this part" bar, big Start/End times,
 * quick presets, and play-selection — less timeline jargon.
 */
export function SoloTrimBar({
  clip,
  currentTime,
  playing,
  onSeek,
  onTrimChange,
  onTogglePlay,
  onRemove,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | 'play' | null>(null);

  const duration = Math.max(0.1, clip.duration);
  const startPct = (clip.trimStart / duration) * 100;
  const endPct = (clip.trimEnd / duration) * 100;
  const playPct = (Math.min(Math.max(currentTime, 0), duration) / duration) * 100;
  const kept = Math.max(0, clip.trimEnd - clip.trimStart);
  const keptLabel = useMemo(() => formatEditorTime(kept), [kept]);

  const timeFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * duration;
  };

  const onPointer = (clientX: number, mode: 'start' | 'end' | 'play') => {
    const t = timeFromClientX(clientX);
    if (mode === 'play') {
      onSeek(Math.min(Math.max(t, clip.trimStart), clip.trimEnd));
      return;
    }
    if (mode === 'start') {
      onTrimChange(Math.min(t, clip.trimEnd - 0.15), clip.trimEnd);
      onSeek(Math.min(t, clip.trimEnd - 0.15));
    } else {
      onTrimChange(clip.trimStart, Math.max(t, clip.trimStart + 0.15));
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-500">Trim</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-800">Keep the part you want</p>
        </div>
        <div className="rounded-2xl bg-indigo-50 px-3 py-1.5 text-sm font-bold tabular-nums text-indigo-700">
          {keptLabel} selected
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pt-4 sm:grid-cols-4 sm:px-5">
        <TimeCard label="Start" value={formatEditorTime(clip.trimStart)} tone="slate" />
        <TimeCard label="End" value={formatEditorTime(clip.trimEnd)} tone="slate" />
        <TimeCard label="Keeping" value={keptLabel} tone="indigo" />
        <TimeCard
          label="Playhead"
          value={formatEditorTime(currentTime)}
          tone="rose"
        />
      </div>

      <div className="px-4 py-5 sm:px-5">
        <div
          ref={trackRef}
          className="relative h-16 touch-none select-none rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 ring-1 ring-slate-200"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
            const t = timeFromClientX(e.clientX);
            const distStart = Math.abs(t - clip.trimStart);
            const distEnd = Math.abs(t - clip.trimEnd);
            const mode =
              distStart < distEnd && distStart < duration * 0.05
                ? 'start'
                : distEnd <= distStart && distEnd < duration * 0.05
                  ? 'end'
                  : 'play';
            setDragging(mode);
            onPointer(e.clientX, mode);
          }}
          onPointerMove={(e) => {
            if (!dragging) return;
            onPointer(e.clientX, dragging);
          }}
          onPointerUp={() => setDragging(null)}
          onPointerCancel={() => setDragging(null)}
        >
          {/* Dim outside selection */}
          <div className="absolute inset-y-0 left-0 rounded-l-2xl bg-slate-900/25" style={{ width: `${startPct}%` }} />
          <div className="absolute inset-y-0 right-0 rounded-r-2xl bg-slate-900/25" style={{ width: `${100 - endPct}%` }} />

          {/* Keep region */}
          <div
            className="absolute inset-y-2 rounded-xl bg-gradient-to-r from-indigo-400/90 to-violet-400/90 shadow-glow-soft"
            style={{ left: `${startPct}%`, width: `${Math.max(1.5, endPct - startPct)}%` }}
          />

          {/* Playhead */}
          <div
            className="absolute top-1 bottom-1 w-1 -translate-x-1/2 rounded-full bg-rose-500 shadow"
            style={{ left: `${playPct}%` }}
          />

          {/* Handles */}
          <div
            className="absolute top-0 bottom-0 z-10 w-4 -translate-x-1/2 cursor-ew-resize"
            style={{ left: `${startPct}%` }}
          >
            <div className="mx-auto h-full w-1.5 rounded-full bg-white ring-2 ring-indigo-600" />
          </div>
          <div
            className="absolute top-0 bottom-0 z-10 w-4 -translate-x-1/2 cursor-ew-resize"
            style={{ left: `${endPct}%` }}
          >
            <div className="mx-auto h-full w-1.5 rounded-full bg-white ring-2 ring-indigo-600" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onTogglePlay}
            className="btn-gradient rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-glow-soft"
          >
            {playing ? 'Pause' : 'Play selection'}
          </button>
          <button
            type="button"
            onClick={() => {
              onTrimChange(0, duration);
              onSeek(0);
            }}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={() => {
              const end = Math.min(duration, 15);
              onTrimChange(0, end);
              onSeek(0);
            }}
            className="rounded-2xl bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
          >
            First 15s
          </button>
          <button
            type="button"
            onClick={() => {
              const start = Math.max(0, duration - 15);
              onTrimChange(start, duration);
              onSeek(start);
            }}
            className="rounded-2xl bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
          >
            Last 15s
          </button>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto rounded-2xl px-3 py-2.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50"
            >
              Remove video
            </button>
          )}
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          Drag the white handles to set start and end. Tap the bar to move the playhead. Highlighted range = what you’ll export.
        </p>
      </div>
    </div>
  );
}

function TimeCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'slate' | 'indigo' | 'rose';
}) {
  const tones = {
    slate: 'bg-slate-50 text-slate-900',
    indigo: 'bg-indigo-50 text-indigo-800',
    rose: 'bg-rose-50 text-rose-800',
  };
  return (
    <div className={`rounded-2xl px-3 py-2.5 ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums sm:text-xl">{value}</p>
    </div>
  );
}
