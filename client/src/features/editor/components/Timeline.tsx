import type { EditorClip } from '../types';
import { formatEditorTime } from '../utils/time';

interface Props {
  clips: EditorClip[];
  activeId: string | null;
  currentTime: number;
  onSelect: (id: string) => void;
  onSeek: (time: number) => void;
  onTrimChange: (id: string, start: number, end: number) => void;
  onRemove: (id: string) => void;
  onAddMore: () => void;
}

/** Multi-clip timeline with trim handles for the active clip. */
export function Timeline({
  clips,
  activeId,
  currentTime,
  onSelect,
  onSeek,
  onTrimChange,
  onRemove,
  onAddMore,
}: Props) {
  const active = clips.find((c) => c.id === activeId) ?? clips[0] ?? null;
  const duration = active?.duration || 1;
  const startPct = active ? (active.trimStart / duration) * 100 : 0;
  const endPct = active ? (active.trimEnd / duration) * 100 : 100;
  const playPct = active ? (currentTime / duration) * 100 : 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Timeline</h3>
        <button
          type="button"
          onClick={onAddMore}
          className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          + Add clip
        </button>
      </div>

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {clips.map((clip, i) => (
          <button
            key={clip.id}
            type="button"
            onClick={() => onSelect(clip.id)}
            className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
              clip.id === activeId
                ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100'
                : 'border-slate-200 bg-slate-50 hover:border-slate-300'
            }`}
          >
            <p className="max-w-[9rem] truncate text-xs font-bold text-slate-900">
              {i + 1}. {clip.name}
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500 tabular-nums">
              {formatEditorTime(clip.trimEnd - clip.trimStart)}
            </p>
          </button>
        ))}
      </div>

      {active && (
        <>
          <div
            className="relative h-14 cursor-pointer rounded-xl bg-slate-100 ring-1 ring-slate-200"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              onSeek(ratio * duration);
            }}
          >
            <div
              className="absolute inset-y-2 rounded-lg bg-indigo-200/80"
              style={{ left: `${startPct}%`, width: `${Math.max(1, endPct - startPct)}%` }}
            />
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-rose-500"
              style={{ left: `${playPct}%` }}
            />
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={active.trimStart}
              onChange={(e) => {
                const v = Number(e.target.value);
                onTrimChange(active.id, Math.min(v, active.trimEnd - 0.1), active.trimEnd);
              }}
              className="absolute inset-x-0 top-0 h-full cursor-ew-resize appearance-none bg-transparent opacity-70"
              aria-label="Trim start"
            />
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={active.trimEnd}
              onChange={(e) => {
                const v = Number(e.target.value);
                onTrimChange(active.id, active.trimStart, Math.max(v, active.trimStart + 0.1));
              }}
              className="absolute inset-x-0 bottom-0 h-full cursor-ew-resize appearance-none bg-transparent opacity-70"
              aria-label="Trim end"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-600">
            <span className="tabular-nums">
              In {formatEditorTime(active.trimStart)} → Out {formatEditorTime(active.trimEnd)}
            </span>
            <button
              type="button"
              onClick={() => onRemove(active.id)}
              className="rounded-lg px-2 py-1 text-rose-600 transition hover:bg-rose-50"
            >
              Remove clip
            </button>
          </div>
        </>
      )}
    </div>
  );
}
