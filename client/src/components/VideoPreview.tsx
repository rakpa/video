import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { VideoInfo } from '../types';
import { formatDuration } from '../utils/format';
import { apiUrl } from '../config/api';
import { PlatformIcon } from './PlatformIcon';

/** Shimmer skeleton shown while metadata is being fetched. */
export function VideoPreviewSkeleton() {
  return (
    <div className="glass overflow-hidden rounded-3xl p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="shimmer relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-100 sm:w-64" />
        <div className="flex-1 space-y-3 py-1">
          <div className="shimmer relative h-5 w-3/4 overflow-hidden rounded bg-slate-100" />
          <div className="shimmer relative h-5 w-1/2 overflow-hidden rounded bg-slate-100" />
          <div className="shimmer relative h-4 w-1/3 overflow-hidden rounded bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

interface Props {
  info: VideoInfo;
}

function resolveThumbSrc(info: VideoInfo): string | null {
  if (!info.thumbnail) return null;
  return info.platform === 'youtube'
    ? info.thumbnail
    : apiUrl(`/api/thumb?url=${encodeURIComponent(info.thumbnail)}`);
}

/** Rich metadata card: thumbnail, title, author, duration, platform badge. */
export function VideoPreview({ info }: Props) {
  const [portrait, setPortrait] = useState(false);
  const thumbSrc = resolveThumbSrc(info);
  const [shownSrc, setShownSrc] = useState<string | null>(null);

  // Preload before swapping src so IG/FB never flash a low-res OG still then the real frame.
  useEffect(() => {
    if (!thumbSrc) {
      setShownSrc(null);
      setPortrait(false);
      return;
    }
    if (thumbSrc === shownSrc) return;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      setPortrait(img.naturalHeight > img.naturalWidth);
      setShownSrc(thumbSrc);
    };
    img.onerror = () => {
      if (!cancelled) setShownSrc(null);
    };
    img.src = thumbSrc;

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shownSrc intentionally excluded
  }, [thumbSrc]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass overflow-hidden rounded-3xl p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div
          className={`relative shrink-0 overflow-hidden rounded-2xl bg-slate-100 ${
            portrait ? 'mx-auto aspect-[9/16] w-44 sm:mx-0' : 'aspect-video w-full sm:w-64'
          }`}
        >
          {shownSrc ? (
            <img
              src={shownSrc}
              alt={info.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="shimmer relative h-full w-full overflow-hidden bg-slate-100" aria-label="Loading thumbnail" />
          )}
          {info.durationSeconds != null && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
              {formatDuration(info.durationSeconds)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
            <PlatformIcon platform={info.platform} className="h-4 w-4" />
            {info.platform}
          </div>
          <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-slate-900 sm:text-xl">
            {info.title}
          </h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path strokeLinecap="round" d="M4 20a8 8 0 0 1 16 0" />
            </svg>
            {info.author}
          </p>
        </div>
      </div>
    </motion.div>
  );
}
