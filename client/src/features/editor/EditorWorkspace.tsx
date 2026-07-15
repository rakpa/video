import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasSettings, EditorClip, EditorTool } from './types';
import { DEFAULT_CANVAS, DEFAULT_TRANSFORM, createClipId, effectiveDuration } from './types';
import { loadVideoMeta, formatEditorTime } from './utils/time';
import { exportEditorProject } from './utils/exportVideo';
import { PreviewStage } from './components/PreviewStage';
import { Timeline } from './components/Timeline';
import { ToolPanel } from './components/ToolPanel';

interface Props {
  initialFiles: File[];
  onClose: () => void;
}

/** Full editor workspace — isolated from the VidCliply downloader. */
export function EditorWorkspace({ initialFiles, onClose }: Props) {
  const [clips, setClips] = useState<EditorClip[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tool, setTool] = useState<EditorTool>('trim');
  const [canvas, setCanvas] = useState<CanvasSettings>(DEFAULT_CANVAS);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportPct, setExportPct] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bootstrapped = useRef(false);

  const active = useMemo(
    () => clips.find((c) => c.id === activeId) ?? clips[0] ?? null,
    [clips, activeId],
  );

  const ingest = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const next: EditorClip[] = [];
      for (const file of files) {
        const meta = await loadVideoMeta(file);
        next.push({
          id: createClipId(),
          file,
          objectUrl: meta.objectUrl,
          name: file.name,
          duration: meta.duration || 1,
          width: meta.width,
          height: meta.height,
          trimStart: 0,
          trimEnd: meta.duration || 1,
          transform: { ...DEFAULT_TRANSFORM, crop: { ...DEFAULT_TRANSFORM.crop } },
        });
      }
      setClips((prev) => [...prev, ...next]);
      setActiveId((id) => id ?? next[0]?.id ?? null);
      if (next[0]) setCurrentTime(next[0].trimStart);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open that video.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current || !initialFiles.length) return;
    bootstrapped.current = true;
    void ingest(initialFiles);
  }, [initialFiles, ingest]);

  const patchActiveTransform = (patch: Partial<EditorClip['transform']>) => {
    if (!active) return;
    setClips((prev) =>
      prev.map((c) =>
        c.id === active.id ? { ...c, transform: { ...c.transform, ...patch } } : c,
      ),
    );
  };

  const splitAtPlayhead = () => {
    if (!active) return;
    const t = Math.min(Math.max(currentTime, active.trimStart + 0.1), active.trimEnd - 0.1);
    if (!(t > active.trimStart && t < active.trimEnd)) {
      setError('Move the playhead inside the clip to split.');
      return;
    }
    const left: EditorClip = {
      ...active,
      id: createClipId(),
      trimEnd: t,
      transform: { ...active.transform, crop: { ...active.transform.crop } },
    };
    const right: EditorClip = {
      ...active,
      id: createClipId(),
      objectUrl: active.objectUrl,
      trimStart: t,
      transform: { ...active.transform, crop: { ...active.transform.crop } },
    };
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === active.id);
      const copy = [...prev];
      copy.splice(idx, 1, left, right);
      return copy;
    });
    setActiveId(left.id);
  };

  const removeClip = (id: string) => {
    setClips((prev) => {
      const target = prev.find((c) => c.id === id);
      const remaining = prev.filter((c) => c.id !== id);
      // Revoke URL only if no other clip shares it (split clones share objectUrl).
      if (target && !remaining.some((c) => c.objectUrl === target.objectUrl)) {
        URL.revokeObjectURL(target.objectUrl);
      }
      if (remaining[0]) setActiveId(remaining[0].id);
      else setActiveId(null);
      return remaining;
    });
    setPlaying(false);
  };

  const handleExport = async () => {
    if (!clips.length) return;
    setError(null);
    setExportPct(0);
    setPlaying(false);
    try {
      const blob = await exportEditorProject({
        clips,
        canvas,
        onProgress: setExportPct,
      });
      const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VidCliply-edit.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExportPct(null);
    }
  };

  const totalOut = clips.reduce((s, c) => s + effectiveDuration(c), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-semibold text-indigo-600 transition hover:text-indigo-700 hover:underline"
          >
            ← Back to editor home
          </button>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Video editor</h1>
          <p className="text-sm font-medium text-slate-500">
            {clips.length} clip{clips.length === 1 ? '' : 's'} · output ≈ {formatEditorTime(totalOut)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            disabled={!active}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!clips.length || exportPct != null}
            className="btn-gradient rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-glow-soft disabled:opacity-60"
          >
            {exportPct != null ? `Exporting ${exportPct}%` : 'Export'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {busy && (
        <p className="text-sm font-medium text-slate-500">Loading video into the editor…</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)]">
        <div className="space-y-5">
          <PreviewStage
            clip={active}
            canvas={canvas}
            playing={playing}
            currentTime={currentTime}
            onTimeUpdate={setCurrentTime}
            onEnded={() => setPlaying(false)}
            videoRef={videoRef}
          />
          <Timeline
            clips={clips}
            activeId={active?.id ?? null}
            currentTime={currentTime}
            onSelect={(id) => {
              setActiveId(id);
              const c = clips.find((x) => x.id === id);
              if (c) {
                setCurrentTime(c.trimStart);
                setPlaying(false);
              }
            }}
            onSeek={(t) => {
              setCurrentTime(t);
              if (videoRef.current) videoRef.current.currentTime = t;
            }}
            onTrimChange={(id, start, end) => {
              setClips((prev) =>
                prev.map((c) => (c.id === id ? { ...c, trimStart: start, trimEnd: end } : c)),
              );
            }}
            onRemove={removeClip}
            onAddMore={() => fileInputRef.current?.click()}
          />
        </div>
        <ToolPanel
          tool={tool}
          onToolChange={setTool}
          clip={active}
          canvas={canvas}
          onTransformPatch={patchActiveTransform}
          onCanvasChange={(patch) => setCanvas((c) => ({ ...c, ...patch }))}
          onSplitAtPlayhead={splitAtPlayhead}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v"
        multiple
        className="hidden"
        onChange={(e) => {
          void ingest(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </div>
  );
}
