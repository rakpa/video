import { motion } from 'framer-motion';
import { useRef, useState } from 'react';
import {
  invokeGalleryShareFromGesture,
  type ShareResult,
  type VideoFilePayload,
} from '../utils/saveVideo';
import { Button } from './Button';

interface Props {
  payload: VideoFilePayload;
  author: string;
  onSaved: (result: ShareResult) => void;
  onDownloadAnother: () => void;
}

/** Mobile: shown when the gallery-ready file is prepared — matches the success save card. */
export function MobileSavePrompt({ payload, author, onSaved, onDownloadAnother }: Props) {
  const sharing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const runSave = () => {
    if (sharing.current || busy) return;
    sharing.current = true;
    setBusy(true);
    setLocalError(null);
    invokeGalleryShareFromGesture(payload, (result) => {
      sharing.current = false;
      setBusy(false);
      if (result === 'unavailable') {
        setLocalError('Could not open the save menu. Tap Save to Gallery again.');
        return;
      }
      onSaved(result);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass relative overflow-hidden rounded-3xl p-8 text-center shadow-card"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.05 }}
        className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50"
      >
        <motion.svg
          viewBox="0 0 24 24"
          className="h-8 w-8 text-emerald-500"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          aria-hidden="true"
        >
          <motion.path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m5 13 4 4L19 7"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          />
        </motion.svg>
      </motion.div>

      <h3 className="mt-5 text-2xl font-bold text-slate-900">Your download is ready! 🎉</h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        Video by <strong className="font-semibold text-slate-700">{author}</strong> is ready. Tap{' '}
        <strong className="font-semibold text-slate-700">Save to Gallery</strong> and pick{' '}
        <strong className="font-semibold text-slate-700">Save Video</strong> to add it to Photos.
      </p>
      {localError && <p className="mx-auto mt-2 max-w-md text-sm text-rose-600">{localError}</p>}

      <div className="mt-6 flex flex-col gap-3">
        <Button variant="primary" size="lg" className="w-full" onClick={runSave} disabled={busy}>
          {busy ? 'Opening…' : 'Save to Gallery'}
        </Button>
        <Button variant="ghost" size="lg" className="w-full" onClick={runSave} disabled={busy}>
          Save again
        </Button>
        <Button variant="ghost" size="lg" className="w-full" onClick={onDownloadAnother}>
          Download another
        </Button>
      </div>
    </motion.div>
  );
}
