import { useCallback, useRef, useState } from 'react';
import { HIDE_PRO } from '../../../config/build';

interface Props {
  onFiles: (files: File[]) => void;
  busy?: boolean;
}

const ACCEPT = 'video/*,.mp4,.webm,.mov,.mkv,.avi,.m4v';

/** Drag-and-drop / file-picker entry for the online video editor. */
export function UploadZone({ onFiles, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = useCallback(
    (list: FileList | File[] | null) => {
      if (!list || busy) return;
      const files = Array.from(list).filter((f) => f.type.startsWith('video/') || /\.(mp4|webm|mov|mkv|avi|m4v)$/i.test(f.name));
      if (files.length) onFiles(files);
    },
    [busy, onFiles],
  );

  return (
    <div
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files);
      }}
      className={`relative overflow-hidden rounded-3xl border-2 border-dashed px-6 py-14 text-center transition sm:px-10 sm:py-16 ${
        dragging
          ? 'border-indigo-400 bg-indigo-50/80'
          : 'border-slate-200 bg-white shadow-card hover:border-indigo-300'
      }`}
    >
      <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-indigo-50 text-indigo-600">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0 4 4m-4-4L8 8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 16.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.5" />
        </svg>
      </div>
      <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">Create Project</h2>
      <p className="mx-auto mt-2 max-w-md text-sm font-medium text-slate-600 sm:text-base">
        {HIDE_PRO ? 'Choose a video from your Photos or Files.' : 'Upload a video or drag and drop files here.'} Edit trim,
        crop, rotate, speed, and more — {HIDE_PRO ? 'right on your device' : 'all in your browser'}.
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="btn-gradient rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-glow-soft disabled:opacity-60"
        >
          {busy ? 'Opening…' : 'Choose video'}
        </button>
        <span className="text-sm font-medium text-slate-400">MP4, WebM, MOV, and more</span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
