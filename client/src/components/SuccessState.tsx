import { useState } from 'react';
import { motion } from 'framer-motion';
import { hasNativeFile, isNativeApp, lastNativeOutcome, shareLastNative } from '../utils/nativeSave';
import { Button } from './Button';

function verifiedLabel(height: number): string {
  if (height >= 2160) return '4K (2160p)';
  if (height >= 1440) return '2K (1440p)';
  return `${height}p`;
}

interface Props {
  /** Measured height of the saved file (ffprobe), when available. */
  outputHeight?: number | null;
  /** Label the user picked before download (e.g. "4K"). */
  requestedLabel?: string;
  /** Mobile browser — Files/Downloads wording instead of desktop folder. */
  mobileBrowser?: boolean;
  /** Audio-only (MP3) download — different wording, no Photos. */
  audio?: boolean;
  /** Native app: reset the page for the next link. */
  onDownloadAnother?: () => void;
}

/** Shown after the file is delivered — replaces quality/download controls. */
export function SuccessState({ outputHeight, requestedLabel, mobileBrowser, audio, onDownloadAnother }: Props) {
  const verified =
    typeof outputHeight === 'number' && outputHeight > 0 ? verifiedLabel(outputHeight) : null;
  const native = isNativeApp();
  const savedToPhotos = native && lastNativeOutcome() === 'photos';
  const [sharing, setSharing] = useState(false);
  const openShare = () => {
    if (sharing) return;
    setSharing(true);
    void shareLastNative()
      .catch(() => undefined)
      .finally(() => setSharing(false));
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

      <h3 className="mt-5 text-2xl font-bold text-slate-900">
        {audio
          ? native
            ? 'MP3 ready'
            : 'MP3 download started'
          : native
            ? savedToPhotos
              ? 'Saved to Photos'
              : 'Download ready'
            : 'Download started'}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
        {audio
          ? native
            ? 'Your MP3 is downloaded.'
            : 'Your MP3 is saving to your device now.'
          : native
            ? savedToPhotos
              ? 'Your video is in the Photos app, in Recents.'
              : 'Your video is downloaded.'
            : 'Your video is saving to your device now.'}
        {verified && (
          <>
            <br />
            <span className="font-medium text-emerald-700">
              Verified output: {verified}
              {requestedLabel ? ` (you chose ${requestedLabel})` : ''}
            </span>
          </>
        )}
        <br />
        {native
          ? audio
            ? 'Tap the button below to save it to Files again or share it.'
            : 'Want it somewhere else? Tap the button below and pick Save to Files to choose a folder.'
          : mobileBrowser
            ? 'Check your Downloads or Files app if you do not see it yet.'
            : 'Large files save through your browser’s download bar — watch progress there for full speed.'}
      </p>
      {native && hasNativeFile() && (
        <div className="mt-6 flex flex-col gap-3">
          <Button variant="primary" size="lg" className="w-full" onClick={openShare} disabled={sharing}>
            {sharing ? 'Opening…' : 'Save to Files / Share'}
          </Button>
          {onDownloadAnother && (
            <Button variant="ghost" size="lg" className="w-full" onClick={onDownloadAnother}>
              Download another
            </Button>
          )}
        </div>
      )}
    </motion.div>
  );
}
