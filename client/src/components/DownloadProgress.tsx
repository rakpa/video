import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { ProgressUpdate } from '../types';

interface Props {
  progress: ProgressUpdate;
  qualityLabel: string;
  /** Mobile: hide 0–100% bar — show a simple processing message until share opens. */
  processingOnly?: boolean;
}

function stageLabel(p: ProgressUpdate): string {
  if (p.percent < 1) return 'Connecting';
  if (p.stage === 'done' || p.percent >= 99) return 'Finishing up';
  if (p.stage === 'merging') return 'Finishing up';
  if (p.percent < 3) return 'Starting';
  return 'Downloading';
}

export function DownloadProgress({ progress, qualityLabel, processingOnly }: Props) {
  const pct = Math.max(0, Math.min(100, progress.percent));
  const showPercent = !processingOnly && pct >= 1;
  const display = useCountUp(showPercent ? pct : 0);

  if (processingOnly) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass relative overflow-hidden rounded-3xl p-6 shadow-card"
      >
        <div className="flex items-center gap-2.5">
          <motion.span
            className="h-2.5 w-2.5 rounded-full bg-accent"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span className="font-semibold text-slate-900">We are processing your download</span>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {processingOnly
            ? 'Your save menu opens as soon as the video is ready — usually a few seconds if you waited on the preview.'
            : 'This usually takes a moment. Your save menu will open when ready.'}
        </p>
        <div className="relative mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <motion.div
            className="btn-gradient absolute inset-y-0 rounded-full"
            initial={{ width: '30%', x: '-100%' }}
            animate={{ x: ['-100%', '350%'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: '30%' }}
          />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass relative overflow-hidden rounded-3xl p-6 shadow-card"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <motion.span
            className="h-2.5 w-2.5 rounded-full bg-accent"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <span className="font-semibold text-slate-900">
            {showPercent ? 'Downloading your video' : 'Connecting to server…'}
          </span>
          {qualityLabel && (
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{qualityLabel}</span>
          )}
        </div>
        <span className="text-sm font-medium text-slate-500">{stageLabel(progress)}</span>
      </div>

      <div className="mt-5 flex items-end justify-between">
        {showPercent ? (
          <span className="text-4xl font-bold tabular-nums text-slate-900">
            {Math.round(display)}<span className="text-2xl font-semibold text-slate-400">%</span>
          </span>
        ) : (
          <p className="text-base text-slate-500">Getting your video ready…</p>
        )}
        {showPercent && (progress.speed || progress.eta) && progress.stage !== 'done' && (
          <div className="flex items-center gap-4 text-sm text-slate-500">
            {progress.speed && (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-indigo-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" />
                </svg>
                {progress.speed}
              </span>
            )}
            {progress.eta && <span className="tabular-nums">ETA {progress.eta}</span>}
          </div>
        )}
      </div>

      <div className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
        {showPercent ? (
          <motion.div
            className="btn-gradient absolute inset-y-0 left-0 rounded-full"
            animate={{ width: `${Math.max(pct, 2)}%` }}
            transition={{ ease: 'easeOut', duration: 0.4 }}
          />
        ) : (
          <motion.div
            className="btn-gradient absolute inset-y-0 rounded-full"
            initial={{ width: '30%', x: '-100%' }}
            animate={{ x: ['-100%', '350%'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: '30%' }}
          />
        )}
      </div>

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
                  : 'bg-slate-200',
              ].join(' ')}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function useCountUp(target: number): number {
  const [value, setValue] = useState(target);
  const raf = useRef<number>();

  useEffect(() => {
    const start = value;
    const startTime = performance.now();
    const duration = 400;

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
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
