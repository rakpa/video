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
      className="glass rounded-2xl border border-slate-200/80 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wider text-slate-400">Download range</h3>
          <p className="mt-1 text-xs text-slate-500">Full video or a custom clip by start and end time.</p>
        </div>
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => onModeChange('full')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mode === 'full' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Full video
          </button>
          <button
            type="button"
            onClick={() => onModeChange('clip')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              mode === 'clip' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Clip only
          </button>
        </div>
      </div>

      {mode === 'clip' && (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Start</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0:30"
              value={startTime}
              onChange={(e) => {
                setTouched(true);
                onStartTimeChange(e.target.value);
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none ring-violet-200 transition focus:border-violet-300 focus:ring-2"
              aria-label="Clip start time"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">End</span>
            <input
              type="text"
              inputMode="numeric"
              placeholder="1:45"
              value={endTime}
              onChange={(e) => {
                setTouched(true);
                onEndTimeChange(e.target.value);
              }}
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none ring-violet-200 transition focus:border-violet-300 focus:ring-2"
              aria-label="Clip end time"
            />
          </label>
        </div>
      )}

      {mode === 'clip' && (
        <p className="mt-3 text-xs text-slate-500">
          Use <span className="font-medium text-slate-600">M:SS</span> or{' '}
          <span className="font-medium text-slate-600">H:MM:SS</span>
          {durationSeconds != null && durationSeconds > 0 ? (
            <>
              {' '}
              · Video length{' '}
              <span className="font-semibold text-slate-700">{formatTimeInput(durationSeconds)}</span>
            </>
          ) : null}
        </p>
      )}

      {mode === 'clip' && touched && validationError && (
        <p className="mt-2 text-xs font-medium text-rose-600">{validationError}</p>
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
