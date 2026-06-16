import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodecMode, Phase, ProgressUpdate, QualityId, VideoInfo } from '../types';
import { detectPlatform } from '../utils/platform';
import { PLACEHOLDER_FORMATS } from '../utils/formats';
import { isPro, licenseToken } from '../lib/license';
import { useStripeReturn } from './useStripeReturn';
import {
  ApiError,
  fetchVideoInfo,
  fetchVideoPreview,
  startDownloadJob,
  subscribeProgress,
  triggerFileDownload,
} from '../api/client';

const INITIAL_PROGRESS: ProgressUpdate = {
  percent: 0,
  speed: null,
  eta: null,
  stage: 'downloading',
  streamIndex: 1,
  streamTotal: 1,
};

function pickDefault(formats: VideoInfo['formats']): QualityId {
  return (formats.find((f) => f.id === '1080' && f.available) ?? formats.find((f) => f.available) ?? formats[0]).id;
}

export function useDownloader() {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate>(INITIAL_PROGRESS);
  const [activeQuality, setActiveQuality] = useState<QualityId | null>(null);
  const [selected, setSelected] = useState<QualityId>('1080');
  const [codecMode, setCodecMode] = useState<CodecMode>('best');
  const [pro, setPro] = useState(isPro);

  const lastJobId = useRef<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const fetchedUrl = useRef<string>('');
  const prevUrlLen = useRef(0);

  useStripeReturn(useCallback(() => setPro(true), []));

  const handleFetch = useCallback(async (target: string) => {
    setError(null);
    setPhase('preview');
    fetchedUrl.current = target;

    const platform = detectPlatform(target)!;
    setInfo({
      platform: platform.id,
      id: '',
      title: 'Loading…',
      author: '…',
      durationSeconds: null,
      thumbnail: null,
      formats: PLACEHOLDER_FORMATS,
    });

    const previewPromise = fetchVideoPreview(target).catch(() => null);
    const fullPromise = fetchVideoInfo(target);

    try {
      const preview = await previewPromise;
      if (preview && fetchedUrl.current === target) {
        setInfo((prev) => ({ ...preview, formats: prev?.formats ?? PLACEHOLDER_FORMATS }));
      }

      const data = await fullPromise;
      if (fetchedUrl.current !== target) return;
      setInfo((prev) => ({
        ...data,
        thumbnail: prev?.thumbnail ?? data.thumbnail,
      }));
      setSelected((current) => {
        const chosen = data.formats.find((f) => f.id === current);
        return chosen?.available ? current : pickDefault(data.formats);
      });
      setPhase((p) => (p === 'preview' || p === 'fetching' ? 'ready' : p));
    } catch (e) {
      if (fetchedUrl.current !== target) return;
      setError(e instanceof ApiError ? e.message : 'Could not fetch that video.');
      setPhase((p) => (p === 'downloading' || p === 'success' ? p : 'error'));
    }
  }, []);

  useEffect(() => {
    const trimmed = url.trim();
    const likelyPaste = trimmed.length - prevUrlLen.current > 8;
    prevUrlLen.current = trimmed.length;

    if (!detectPlatform(trimmed)) {
      if (phase !== 'idle' && phase !== 'downloading') {
        setInfo(null);
        setPhase('idle');
        setError(null);
      }
      return;
    }
    if (trimmed === fetchedUrl.current || phase === 'downloading') return;
    const delay = likelyPaste ? 0 : 200;
    const t = setTimeout(() => handleFetch(trimmed), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleDownload = useCallback(
    async (quality: QualityId, mode: CodecMode) => {
      if (!info) return;
      const fmt = info.formats.find((f) => f.id === quality);
      if (fmt?.premium && !pro) {
        window.location.href = '/pricing';
        return;
      }
      setError(null);
      setActiveQuality(quality);
      setProgress(INITIAL_PROGRESS);
      setPhase('downloading');
      try {
        const jobId = await startDownloadJob(url, quality, mode, licenseToken());
        lastJobId.current = jobId;

        unsubscribe.current?.();
        unsubscribe.current = subscribeProgress(jobId, {
          onProgress: setProgress,
          onDone: () => {
            triggerFileDownload(jobId);
            setPhase('success');
          },
          onError: (message) => {
            setError(message);
            setPhase('error');
          },
        });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not start the download.');
        setPhase('error');
      }
    },
    [info, url, pro],
  );

  const handleRedownload = useCallback(() => {
    if (lastJobId.current) triggerFileDownload(lastJobId.current);
  }, []);

  const handleReset = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    lastJobId.current = null;
    fetchedUrl.current = '';
    setUrl('');
    setInfo(null);
    setError(null);
    setActiveQuality(null);
    setProgress(INITIAL_PROGRESS);
    setPhase('idle');
  }, []);

  const analyze = useCallback(() => {
    const trimmed = url.trim();
    if (detectPlatform(trimmed)) handleFetch(trimmed);
  }, [url, handleFetch]);

  return {
    url,
    setUrl,
    phase,
    info,
    error,
    setError,
    progress,
    activeQuality,
    selected,
    setSelected,
    codecMode,
    setCodecMode,
    pro,
    handleFetch,
    handleDownload,
    handleRedownload,
    handleReset,
    analyze,
    fetchedUrl: fetchedUrl.current,
  };
}

export type DownloaderState = ReturnType<typeof useDownloader>;
