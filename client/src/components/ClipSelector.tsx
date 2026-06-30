import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  formatTimeInput,
  parseTimeInput,
  validateClipRange,
  type ClipMode,
} from '../utils/clipTime';

interface Props {
  durationSeconds: number | null;
  mode: ClipMode;
  onModeChange: (mode: ClipMode) => void;
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}

export function ClipSelector({
  durationSeconds,
  mode,
  onModeChange,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
}: Props) {
  const [touched, setTouched] = useState(false);

  const validationError = useMemo(() => {
    if (mode !== 'clip') return null;
    const start = parseTimeInput(startTime);
    const end = parseTimeInput(endTime);
    return validateClipRange(start, end, durationSeconds);
  }, [mode, startTime, endTime, durationSeconds]);

  useEffect(() => {
    if (mode === 'clip' && durationSeconds != null && durationSeconds > 0 && !endTime) {
      onEndTimeChange(formatTimeInput(durationSeconds));
    }
  }, [mode, durationSeconds, endTime, onEndTimeChange]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={`rounded-2xl border-2 p-5 shadow-card transition-colors sm:p-6 ${
        mode === 'clip'
          ? 'border-violet-300 bg-gradient-to-br from-violet-50/90 via-white to-indigo-50/80'
          : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${
              mode === 'clip' ? 'bg-accent-gradient text-white shadow-glow-soft' : 'bg-violet-100 text-violet-700'
            }`}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" d="M4 8h4m8 0h4M4 16h4m8 0h4M9 4v16m6-16v16" />
            </svg>
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900 sm:text-lg">Download range</h3>
            <p className="mt-0.5 text-sm font-medium text-slate-600">
              Download the full video or trim to a specific section.
            </p>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label="Download range"
          className="inline-flex w-full rounded-2xl border-2 border-slate-200 bg-slate-100 p-1.5 sm:w-auto"
        >
          {(
            [
              { id: 'full' as const, label: 'Full video', icon: '▶' },
              { id: 'clip' as const, label: 'Clip only', icon: '✂' },
            ] as const
          ).map((opt) => {
            const active = mode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onModeChange(opt.id)}
                className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition sm:flex-initial sm:px-5 ${
                  active ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="clip-range-pill"
                    transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                    className="absolute inset-0 rounded-xl bg-accent-gradient shadow-glow-soft"
                  />
                )}
                <span className="relative z-10" aria-hidden="true">
                  {opt.icon}
                </span>
                <span className="relative z-10">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {mode === 'clip' && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          transition={{ duration: 0.25 }}
          className="mt-5 overflow-hidden"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-bold text-slate-800">Start time</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0:30"
                value={startTime}
                onChange={(e) => {
                  setTouched(true);
                  onStartTimeChange(e.target.value);
                }}
                className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                aria-label="Clip start time"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-800">End time</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="1:45"
                value={endTime}
                onChange={(e) => {
                  setTouched(true);
                  onEndTimeChange(e.target.value);
                }}
                className="mt-2 w-full rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                aria-label="Clip end time"
              />
            </label>
          </div>

          <p className="mt-4 rounded-xl bg-white/80 px-3 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200/80">
            Format: <span className="font-bold text-slate-900">M:SS</span> or{' '}
            <span className="font-bold text-slate-900">H:MM:SS</span>
            {durationSeconds != null && durationSeconds > 0 ? (
              <>
                {' '}
                · Full video is{' '}
                <span className="font-bold text-violet-700">{formatTimeInput(durationSeconds)}</span>
              </>
            ) : null}
          </p>

          {touched && validationError && (
            <p className="mt-3 text-sm font-semibold text-rose-600">{validationError}</p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

export function isClipReady(
  mode: ClipMode,
  startTime: string,
  endTime: string,
  durationSeconds: number | null,
): boolean {
  if (mode !== 'clip') return true;
  const start = parseTimeInput(startTime);
  const end = parseTimeInput(endTime);
  return validateClipRange(start, end, durationSeconds) === null;
}
