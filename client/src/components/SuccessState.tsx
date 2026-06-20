import { motion } from 'framer-motion';
import { Confetti } from './Confetti';
import { Button } from './Button';

interface Props {
  title: string;
  onReset: () => void;
  onRedownload: () => void;
  /** Mobile: show Save to Gallery (share sheet → Photos) instead of Files download. */
  mobile?: boolean;
  onSaveToGallery?: () => void;
  saving?: boolean;
  /** Mobile: the gallery-ready MP4 is still being fetched/transcoded in the background. */
  preparing?: boolean;
}

/** Celebratory success card with save-to-gallery on mobile or download-again on desktop. */
export function SuccessState({ title, onReset, onRedownload, mobile, onSaveToGallery, saving, preparing }: Props) {
  const saveLabel = preparing ? 'Preparing video…' : saving ? 'Opening share…' : 'Save to Gallery';
  const saveBusy = Boolean(saving || preparing);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass relative overflow-hidden rounded-3xl p-8 text-center shadow-card"
    >
      <Confetti />

      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 16, delay: 0.1 }}
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
            transition={{ duration: 0.4, delay: 0.25 }}
          />
        </motion.svg>
      </motion.div>

      <h3 className="mt-5 text-2xl font-bold text-slate-900">Your download is ready! 🎉</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        <span className="line-clamp-1 font-medium text-slate-700">{title}</span>
        {mobile ? (
          preparing ? (
            <>
              {' '}
              is downloading — getting it ready for your Photos gallery. The{' '}
              <strong className="font-medium text-slate-700">Save to Gallery</strong> button unlocks in a moment.
            </>
          ) : (
            <>
              {' '}
              is ready. Tap <strong className="font-medium text-slate-700">Save to Gallery</strong>, then pick{' '}
              <strong className="font-medium text-slate-700">Save Video</strong> in the share menu.
              If a video player opens instead, use its Share button → Save Video.
            </>
          )
        ) : (
          <> has been saved to your device as an MP4 with sound.</>
        )}
      </p>

      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        {mobile && onSaveToGallery ? (
          <>
            <Button onClick={onSaveToGallery} disabled={saveBusy}>
              {saveLabel}
            </Button>
            <Button variant="ghost" onClick={onRedownload} disabled={saveBusy}>
              Save again
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onRedownload}>Download again</Button>
        )}
        <Button variant={mobile ? 'ghost' : undefined} onClick={onReset} disabled={saveBusy}>
          Download another
        </Button>
      </div>
    </motion.div>
  );
}
