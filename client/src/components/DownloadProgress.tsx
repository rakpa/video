import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { ProgressUpdate } from '../types';

interface Props {
  progress: ProgressUpdate;
  qualityLabel: string;
}

/** Human label for the current phase, aware of which stream is downloading. */
function stageLabel(p: ProgressUpdate): string {
  if (p.stage === 'merging') return 'Merging video + audio';
  if (p.stage === 'done') return 'Finishing up';
  if (p.streamTotal > 1) {
    return p.streamIndex >= 2 ? 'Downloading audio' : 'Downloading video';
  }
  return 'Downloading';
}

/**
 * Engaging download progress: an animated conic-gradient ring with a counting
 * percentage, a shimmering linear bar, a moving comet, and live speed/ETA.
 * The overall % is already smoothed + monotonic on the server.
 */
export function DownloadProgress({ progress, qualityLabel }: Props) {
  const pct = Math.max(0, Math.min(100, progress.percent));
  const display = useCountUp(pct);
  const indeterminate = pct < 0.5 && progress.stage === 'downloading';

  // Friendly message during cold-start / initial wait (Render free tier ~50s wake)
  const initialWaitMessage = indeterminate 
    ? 'Waking up download service… (first request can take up to ~60s on free hosting)'
    : progress.stage === 'merging' 
      ? 'Stitching streams…' 
      : 'Starting…';

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass relative overflow-hidden rounded-3xl p-6 shadow-card"
    >
      {/* Ambient pulsing glow behind the ring */}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl"
        animate={{ scale: [1, 1.25, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative flex items-center gap-5">
        <ProgressRing pct={pct} display={display} indeterminate={indeterminate} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <motion.span
              className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px] shadow-accent"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            <span className="truncate font-semibold text-white">{stageLabel(progress)}</span>
            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-white/60">{qualityLabel}</span>
          </div>

          {/* Linear track with comet + shimmer */}
          <div className="relative mt-4 h-3 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="btn-gradient absolute inset-y-0 left-0 rounded-full"
              animate={{ width: `${Math.max(pct, indeterminate ? 0 : 2)}%` }}
              transition={{ ease: 'easeOut', duration: 0.4 }}
            />
            {/* Moving highlight comet riding the filled edge */}
            {!indeterminate && pct < 100 && (
              <motion.div
                className="absolute top-0 h-full w-16 -translate-x-full bg-gradient-to-r from-transparent to-white/50 blur-[2px]"
                animate={{ left: `${pct}%` }}
                transition={{ ease: 'easeOut', duration: 0.4 }}
              />
            )}
            {/* Indeterminate sweeper before the first byte / during merge */}
            {(indeterminate || progress.stage === 'merging') && (
              <motion.div
                className="absolute inset-y-0 w-1/3 rounded-full bg-white/25"
                animate={{ x: ['-120%', '320%'] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-white/55">
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              {progress.speed ? (
                <>
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-accent-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" />
                  </svg>
                  {progress.speed}
                </>
              ) : (
                initialWaitMessage
              )}
            </span>
            <span className="tabular-nums">
              {progress.eta ? `ETA ${progress.eta}` : 'Keep this tab open'}
            </span>
          </div>
        </div>
      </div>

      {/* Stream pips when there are multiple streams */}
      {progress.streamTotal > 1 && progress.stage !== 'done' && (
        <div className="relative mt-4 flex items-center gap-1.5">
          {Array.from({ length: progress.streamTotal }).map((_, i) => (
            <span
              key={i}
              className={[
                'h-1 flex-1 rounded-full transition-colors duration-300',
                i < progress.streamIndex - (progress.stage === 'merging' ? 0 : 1)
                  ? 'bg-accent'
                  : i === progress.streamIndex - 1 && progress.stage !== 'merging'
                    ? 'bg-accent/60'
                  : 'bg-white/10',
              ].join(' ')}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

/** Circular conic-gradient progress ring with a counting number in the center. */
function ProgressRing({ pct, display, indeterminate }: { pct: number; display: number; indeterminate: boolean }) {
  return (
    <div className="relative grid h-24 w-24 shrink-0 place-items-center">
      {/* Spinning ring while indeterminate, static fill otherwise */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: indeterminate
            ? 'conic-gradient(#7c5cff 0deg, #c44bff 90deg, transparent 90deg)'
            : `conic-gradient(#7c5cff 0deg, #c44bff ${pct * 3.6}deg, rgba(255,255,255,0.08) ${pct * 3.6}deg)`,
        }}
        animate={indeterminate ? { rotate: 360 } : { rotate: 0 }}
        transition={indeterminate ? { duration: 1, repeat: Infinity, ease: 'linear' } : { duration: 0.4 }}
      />
      {/* Inner disc to create the ring */}
      <div className="absolute inset-[6px] rounded-full bg-ink-900/90 backdrop-blur" />
      <div className="relative text-center">
        <span className="text-xl font-bold tabular-nums text-white">{Math.round(display)}</span>
        <span className="text-sm font-semibold text-white/60">%</span>
      </div>
    </div>
  );
}

/** Smoothly animates a number toward `target` for a satisfying counting effect. */
function useCountUp(target: number): number {
  const [value, setValue] = useState(target);
  const raf = useRef<number>();

  useEffect(() => {
    const start = value;
    const startTime = performance.now();
    const duration = 400;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(start + (target - start) * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}
