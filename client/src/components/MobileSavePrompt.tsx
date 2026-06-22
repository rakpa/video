import { motion } from 'framer-motion';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  invokeGalleryShareFromGesture,
  shareVideoToGallery,
  type ShareResult,
  type VideoFilePayload,
} from '../utils/saveVideo';

interface Props {
  payload: VideoFilePayload;
  onDone: (result: ShareResult) => void;
}

/**
 * Opens the gallery save sheet as soon as this mounts (Android). On iOS the
 * share API needs a touch — a Save button appears only if auto-open fails.
 */
export function MobileSavePrompt({ payload, onDone }: Props) {
  const triedAuto = useRef(false);
  const [showButton, setShowButton] = useState(false);

  useLayoutEffect(() => {
    if (triedAuto.current) return;
    triedAuto.current = true;
    void shareVideoToGallery(payload).then((result) => {
      if (result === 'shared' || result === 'cancelled') onDone(result);
    });
    const t = window.setTimeout(() => setShowButton(true), 700);
    return () => window.clearTimeout(t);
  }, [payload, onDone]);

  const handleSave = (e: React.TouchEvent | React.PointerEvent) => {
    e.preventDefault();
    invokeGalleryShareFromGesture(payload, (result) => {
      onDone(result);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass overflow-hidden rounded-3xl p-6 shadow-card"
    >
      <div className="flex items-center gap-2.5">
        <motion.span
          className="h-2.5 w-2.5 rounded-full bg-emerald-500"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        <span className="font-semibold text-slate-900">Opening save menu…</span>
      </div>
      <p className="mt-3 text-sm text-slate-500">
        {showButton
          ? 'Tap Save to Gallery below to add this video to your device.'
          : 'Your video is ready — the save menu should appear momentarily.'}
      </p>
      {showButton && (
        <button
          type="button"
          onTouchStart={handleSave}
          onPointerDown={handleSave}
          className="btn-gradient mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-lg font-semibold text-white shadow-glow-soft"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
          </svg>
          Save to Gallery
        </button>
      )}
    </motion.div>
  );
}
