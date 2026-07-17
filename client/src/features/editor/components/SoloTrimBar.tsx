import { useEffect, useMemo, useRef, useState } from 'react';
import type { EditorClip } from '../types';
import { formatEditorTime, parseEditorTime } from '../utils/time';

interface Props {
  clip: EditorClip;
  currentTime: number;
  playing: boolean;
  onSeek: (time: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onTogglePlay: () => void;
  onSplit?: () => void;
  canSplit?: boolean;
  onRemove?: () => void;
}

/**
 * CapCut-style trim: editable Start/End times, drag handles, and Split on the
 * playhead dragger — one clear “keep this range” surface.
 */
export function SoloTrimBar({
  clip,
  currentTime,
  playing,
  onSeek,
  onTrimChange,
  onTogglePlay,
  onSplit,
  canSplit = false,
  onRemove,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | 'play' | null>(null);
  const [startDraft, setStartDraft] = useState(formatEditorTime(clip.trimStart));
  const [endDraft, setEndDraft] = useState(formatEditorTime(clip.trimEnd));

  const duration = Math.max(0.1, clip.duration);
  const startPct = (clip.trimStart / duration) * 100;
  const endPct = (clip.trimEnd / duration) * 100;
  const playPct = (Math.min(Math.max(currentTime, 0), duration) / duration) * 100;
  const kept = Math.max(0, clip.trimEnd - clip.trimStart);
  const keptLabel = useMemo(() => formatEditorTime(kept), [kept]);

  useEffect(() => {
    if (dragging === 'start') return;
    setStartDraft(formatEditorTime(clip.trimStart));
  }, [clip.trimStart, dragging]);

  useEffect(() => {
    if (dragging === 'end') return;
    setEndDraft(formatEditorTime(clip.trimEnd));
  }, [clip.trimEnd, dragging]);

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
      const next = Math.min(t, clip.trimEnd - 0.15);
      onTrimChange(Math.max(0, next), clip.trimEnd);
      onSeek(Math.max(0, next));
    } else {
      onTrimChange(clip.trimStart, Math.min(duration, Math.max(t, clip.trimStart + 0.15)));
    }
  };

  const commitStart = () => {
    const parsed = parseEditorTime(startDraft);
    if (parsed == null) {
      setStartDraft(formatEditorTime(clip.trimStart));
      return;
    }
    const next = Math.min(Math.max(0, parsed), clip.trimEnd - 0.15);
    onTrimChange(next, clip.trimEnd);
    onSeek(next);
    setStartDraft(formatEditorTime(next));
  };

  const commitEnd = () => {
    const parsed = parseEditorTime(endDraft);
    if (parsed == null) {
      setEndDraft(formatEditorTime(clip.trimEnd));
      return;
    }
    const next = Math.max(Math.min(duration, parsed), clip.trimStart + 0.15);
    onTrimChange(clip.trimStart, next);
    setEndDraft(formatEditorTime(next));
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-[0.16em] text-white">
            Trim
          </span>
          <p className="text-sm font-semibold text-slate-700">Drag handles · type times · split on playhead</p>
        </div>
        <div className="rounded-2xl bg-indigo-50 px-3 py-1.5 text-sm font-bold tabular-nums text-indigo-700">
          {keptLabel} kept
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 px-4 pt-4 sm:px-5">
        <TimeField
          label="Start"
          value={startDraft}
          onChange={setStartDraft}
          onCommit={commitStart}
        />
        <TimeField
          label="End"
          value={endDraft}
          onChange={setEndDraft}
          onCommit={commitEnd}
        />
        <div className="rounded-2xl bg-rose-50 px-3 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700/70">Playhead</p>
          <p className="mt-0.5 text-lg font-bold tabular-nums text-rose-800 sm:text-xl">
            {formatEditorTime(currentTime)}
          </p>
        </div>
      </div>

      <div className="px-4 py-5 sm:px-5">
        {/* Extra top padding so the Split chip on the playhead isn’t clipped */}
        <div className="relative pt-9">
          <div
            ref={trackRef}
            className="relative h-[4.25rem] touch-none select-none rounded-2xl bg-gradient-to-r from-slate-100 via-slate-50 to-slate-100 ring-1 ring-slate-200"
            onPointerDown={(e) => {
              // Don’t start a drag when tapping the Split chip.
              if ((e.target as HTMLElement).closest('[data-split-hit]')) return;
              (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
              const t = timeFromClientX(e.clientX);
              const edge = duration * 0.04;
              const distStart = Math.abs(t - clip.trimStart);
              const distEnd = Math.abs(t - clip.trimEnd);
              const mode =
                distStart < distEnd && distStart < edge
                  ? 'start'
                  : distEnd <= distStart && distEnd < edge
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
            <div
              className="absolute inset-y-0 left-0 rounded-l-2xl bg-slate-900/30"
              style={{ width: `${startPct}%` }}
            />
            <div
              className="absolute inset-y-0 right-0 rounded-r-2xl bg-slate-900/30"
              style={{ width: `${100 - endPct}%` }}
            />

            <div
              className="absolute inset-y-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 shadow-glow-soft"
              style={{ left: `${startPct}%`, width: `${Math.max(1.5, endPct - startPct)}%` }}
            >
              <div
                className="absolute inset-0 opacity-30"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(90deg, transparent 0 10px, rgba(255,255,255,0.35) 10px 12px)',
                }}
              />
            </div>

            {/* Start handle + time */}
            <div
              className="absolute top-0 bottom-0 z-20 w-7 -translate-x-1/2 cursor-ew-resize"
              style={{ left: `${startPct}%` }}
            >
              <div className="mx-auto flex h-full w-2.5 flex-col items-center justify-center rounded-full bg-white shadow ring-2 ring-indigo-600">
                <span className="h-3 w-0.5 rounded bg-indigo-500" />
                <span className="mt-0.5 h-3 w-0.5 rounded bg-indigo-500" />
              </div>
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tabular-nums text-slate-600">
                {formatEditorTime(clip.trimStart)}
              </span>
            </div>

            {/* End handle + time */}
            <div
              className="absolute top-0 bottom-0 z-20 w-7 -translate-x-1/2 cursor-ew-resize"
              style={{ left: `${endPct}%` }}
            >
              <div className="mx-auto flex h-full w-2.5 flex-col items-center justify-center rounded-full bg-white shadow ring-2 ring-indigo-600">
                <span className="h-3 w-0.5 rounded bg-indigo-500" />
                <span className="mt-0.5 h-3 w-0.5 rounded bg-indigo-500" />
              </div>
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tabular-nums text-slate-600">
                {formatEditorTime(clip.trimEnd)}
              </span>
            </div>

            {/* Playhead dragger + Split on the needle */}
            <div
              className="absolute top-0 bottom-0 z-30 flex w-10 -translate-x-1/2 flex-col items-center"
              style={{ left: `${playPct}%` }}
            >
              {onSplit && (
                <button
                  type="button"
                  data-split-hit
                  onClick={(e) => {
                    e.stopPropagation();
                    onSplit();
                  }}
                  disabled={!canSplit}
                  title={
                    canSplit
                      ? 'Split at playhead'
                      : 'Move the playhead inside the trim to split'
                  }
                  className="absolute -top-9 flex items-center gap-1 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
                >
                  <SplitIcon />
                  Split
                </button>
              )}
              <div className="h-full w-0.5 rounded-full bg-rose-500 shadow" />
              <div className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-rose-500 shadow" />
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-2">
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
              Remove clip
            </button>
          )}
        </div>
        <p className="mt-3 text-xs font-medium text-slate-500">
          Type Start/End times, drag the white handles to trim, move the rose playhead, then tap{' '}
          <span className="font-semibold text-slate-700">Split</span> on the dragger to cut into two clips.
        </p>
      </div>
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <label className="block rounded-2xl bg-slate-50 px-3 py-2.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          }
        }}
        aria-label={`${label} time`}
        className="mt-0.5 w-full border-0 bg-transparent p-0 text-lg font-bold tabular-nums text-slate-900 outline-none ring-0 sm:text-xl"
      />
    </label>
  );
}

function SplitIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" aria-hidden="true">
      <path
        d="M4 3.5 8 8l4-4.5M8 8v5.5M3.5 12.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
