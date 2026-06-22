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
 * Shown when the gallery-ready file is prepared. Auto-tries share on mount (Android).
 * On iOS, shows a Save to Gallery button — no processing spinner once the button is visible.
 */
export function MobileSavePrompt({ payload, onDone }: Props) {
  const triedAuto = useRef(false);
  const sharing = useRef(false);
  const [showButton, setShowButton] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (triedAuto.current) return;
    triedAuto.current = true;
    void shareVideoToGallery(payload).then((result) => {
      if (result === 'shared' || result === 'cancelled') onDone(result);
    });
    const t = window.setTimeout(() => setShowButton(true), 300);
    return () => window.clearTimeout(t);
  }, [payload, onDone]);

  const handleSave = () => {
    if (sharing.current || busy) return;
    sharing.current = true;
    setBusy(true);
    setLocalError(null);
    invokeGalleryShareFromGesture(payload, (result) => {
      sharing.current = false;
      setBusy(false);
      if (result === 'shared' || result === 'cancelled') {
        onDone(result);
        return;
      }
      setLocalError('Could not open the save menu. Tap Save to Gallery again.');
    });
  };

  const ready = showButton || Boolean(localError);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass overflow-hidden rounded-3xl p-6 shadow-card"
    >
      <div className="flex items-center gap-2.5">
        {ready && !busy ? (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
            </svg>
          </span>
        ) : (
          <motion.span
            className="h-2.5 w-2.5 rounded-full bg-accent"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
        )}
        <span className="font-semibold text-slate-900">
          {busy ? 'Opening save menu…' : ready ? 'Your video is ready' : 'Opening save menu…'}
        </span>
      </div>
      {ready && (
        <>
          <p className="mt-3 text-sm text-slate-500">
            {localError ??
              'Tap Save to Gallery, then choose Save Video to add it to your Photos.'}
          </p>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className="btn-gradient mt-5 flex w-full items-center justify-center gap-2.5 rounded-2xl px-6 py-4 text-lg font-semibold text-white shadow-glow-soft disabled:opacity-70"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
            </svg>
            {busy ? 'Opening…' : 'Save to Gallery'}
          </button>
        </>
      )}
    </motion.div>
  );
}
