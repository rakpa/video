import { motion } from 'framer-motion';
import type { VideoInfo } from '../types';
import { formatDuration } from '../utils/format';
import { PlatformIcon } from './PlatformIcon';

/** Shimmer skeleton shown while metadata is being fetched. */
export function VideoPreviewSkeleton() {
  return (
    <div className="glass overflow-hidden rounded-3xl p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="shimmer relative aspect-video w-full overflow-hidden rounded-2xl bg-white/5 sm:w-64" />
        <div className="flex-1 space-y-3 py-1">
          <div className="shimmer relative h-5 w-3/4 overflow-hidden rounded bg-white/5" />
          <div className="shimmer relative h-5 w-1/2 overflow-hidden rounded bg-white/5" />
          <div className="shimmer relative h-4 w-1/3 overflow-hidden rounded bg-white/5" />
        </div>
      </div>
    </div>
  );
}

interface Props {
  info: VideoInfo;
}

/** Rich metadata card: thumbnail, title, author, duration, platform badge. */
export function VideoPreview({ info }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass overflow-hidden rounded-3xl p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-2xl bg-ink-800 sm:w-64">
          {info.thumbnail ? (
            <img
              src={info.thumbnail}
              alt={info.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="grid h-full w-full place-items-center text-white/30">No preview</div>
          )}
          {info.durationSeconds != null && (
            <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
              {formatDuration(info.durationSeconds)}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium capitalize text-white/70">
            <PlatformIcon platform={info.platform} className="h-4 w-4" />
            {info.platform}
          </div>
          <h2 className="line-clamp-2 text-lg font-semibold leading-snug text-white sm:text-xl">
            {info.title}
          </h2>
          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-white/55">
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
