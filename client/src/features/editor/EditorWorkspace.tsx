import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CanvasSettings, EditorClip, EditorTool } from './types';
import { DEFAULT_CANVAS, DEFAULT_TRANSFORM, createClipId, effectiveDuration } from './types';
import { loadVideoMeta, formatEditorTime } from './utils/time';
import { exportEditorProject } from './utils/exportVideo';
import { isNativeApp, saveBlobNative } from '../../utils/nativeSave';
import { PreviewStage } from './components/PreviewStage';
import { SoloTrimBar } from './components/SoloTrimBar';
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
  const [exportStage, setExportStage] = useState('');
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

  const removeClip = (id: string) => {
    setClips((prev) => {
      const target = prev.find((c) => c.id === id);
      const remaining = prev.filter((c) => c.id !== id);
      if (target && !remaining.some((c) => c.objectUrl === target.objectUrl)) {
        URL.revokeObjectURL(target.objectUrl);
      }
      if (remaining[0]) setActiveId(remaining[0].id);
      else setActiveId(null);
      return remaining;
    });
    setPlaying(false);
  };

  const playSelection = () => {
    if (!active) return;
    if (playing) {
      setPlaying(false);
      return;
    }
    const t = currentTime < active.trimStart || currentTime >= active.trimEnd - 0.05
      ? active.trimStart
      : currentTime;
    setCurrentTime(t);
    if (videoRef.current) videoRef.current.currentTime = t;
    setPlaying(true);
  };

  const canSplit =
    !!active &&
    currentTime > active.trimStart + 0.15 &&
    currentTime < active.trimEnd - 0.15;

  const splitAtPlayhead = () => {
    if (!active || !canSplit) {
      setError('Move the playhead inside the highlighted selection, then tap Split here.');
      return;
    }
    setError(null);
    setPlaying(false);
    const cut = currentTime;
    const left: EditorClip = {
      ...active,
      id: createClipId(),
      trimEnd: cut,
      name: `${baseClipName(active.name)} · 1`,
      transform: cloneTransform(active.transform),
    };
    const right: EditorClip = {
      ...active,
      id: createClipId(),
      trimStart: cut,
      name: `${baseClipName(active.name)} · 2`,
      transform: cloneTransform(active.transform),
    };
    setClips((prev) => {
      const idx = prev.findIndex((c) => c.id === active.id);
      if (idx < 0) return prev;
      const next = [...prev];
      next.splice(idx, 1, left, right);
      return renumberClipNames(next);
    });
    setActiveId(left.id);
    setCurrentTime(left.trimStart);
    if (videoRef.current) videoRef.current.currentTime = left.trimStart;
  };

  const handleExport = async () => {
    if (!clips.length) return;
    setError(null);
    setExportPct(1);
    setExportStage('Starting…');
    setPlaying(false);
    try {
      const blob = await exportEditorProject({
        clips,
        canvas,
        onProgress: setExportPct,
        onStage: setExportStage,
      });
      const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
      if (isNativeApp()) {
        // WKWebView ignores <a download> — save to Photos / share sheet instead.
        await saveBlobNative(blob, `VidCliply-edit.${ext}`);
        return;
      }
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
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Trim & edit</h1>
          <p className="text-sm font-medium text-slate-500">
            {active ? active.name : 'No video'} · export ≈ {formatEditorTime(totalOut)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
          >
            Replace video
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!clips.length || exportPct != null}
            className="btn-gradient rounded-2xl px-5 py-2.5 text-sm font-semibold text-white shadow-glow-soft disabled:opacity-60"
          >
            {exportPct != null ? `Exporting ${exportPct}%…` : isNativeApp() ? 'Save edit' : 'Download edit'}
          </button>
        </div>
      </div>

      {exportPct != null && (
        <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/80 px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-indigo-800">
            <span>{exportStage || 'Fast export running…'}</span>
            <span className="tabular-nums">{exportPct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
            <div
              className="h-full rounded-full bg-indigo-500 transition-[width] duration-150"
              style={{ width: `${Math.max(2, exportPct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-indigo-700/80">
            Speeding through your video on-device (not recording in real time). Full quality, with
            sound — keep {isNativeApp() ? 'the app' : 'this tab'} open until it finishes.
            {isNativeApp() ? ' It is saved to your Photos when done.' : ''}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {busy && (
        <p className="text-sm font-medium text-slate-500">Loading video into the editor…</p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)]">
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
          {clips.length > 1 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-card sm:p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Clips · export order
                </p>
                <p className="text-xs font-medium text-slate-500 tabular-nums">
                  {clips.length} parts · {formatEditorTime(totalOut)}
                </p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {clips.map((clip, i) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => {
                      setActiveId(clip.id);
                      setPlaying(false);
                      setCurrentTime(clip.trimStart);
                      if (videoRef.current) videoRef.current.currentTime = clip.trimStart;
                    }}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-left transition ${
                      clip.id === active?.id
                        ? 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-100'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    <p className="max-w-[10rem] truncate text-xs font-bold text-slate-900">
                      {i + 1}. {clip.name}
                    </p>
                    <p className="mt-0.5 text-[11px] font-medium text-slate-500 tabular-nums">
                      {formatEditorTime(clip.trimEnd - clip.trimStart)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {active && (
            <SoloTrimBar
              clip={active}
              currentTime={currentTime}
              playing={playing}
              onSeek={(t) => {
                setCurrentTime(t);
                if (videoRef.current) videoRef.current.currentTime = t;
              }}
              onTrimChange={(start, end) => {
                setClips((prev) =>
                  prev.map((c) =>
                    c.id === active.id ? { ...c, trimStart: start, trimEnd: end } : c,
                  ),
                );
              }}
              onTogglePlay={playSelection}
              onSplit={splitAtPlayhead}
              canSplit={canSplit}
              onRemove={() => removeClip(active.id)}
            />
          )}
        </div>
        <ToolPanel
          tool={tool === 'trim' ? 'crop' : tool}
          onToolChange={(t) => setTool(t === 'trim' ? 'crop' : t)}
          clip={active}
          canvas={canvas}
          onTransformPatch={patchActiveTransform}
          onCanvasChange={(patch) => setCanvas((c) => ({ ...c, ...patch }))}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          // Replace: clear previous clips.
          setClips((prev) => {
            for (const c of prev) URL.revokeObjectURL(c.objectUrl);
            return [];
          });
          setActiveId(null);
          void ingest([file]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

function cloneTransform(t: EditorClip['transform']): EditorClip['transform'] {
  return { ...t, crop: { ...t.crop } };
}

function baseClipName(name: string): string {
  return name.replace(/\s·\s\d+$/, '').trim() || name;
}

function renumberClipNames(list: EditorClip[]): EditorClip[] {
  if (list.length <= 1) return list;
  return list.map((c, i) => ({
    ...c,
    name: `${baseClipName(c.name)} · ${i + 1}`,
  }));
}
