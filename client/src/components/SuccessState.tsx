import { motion } from 'framer-motion';
import { Confetti } from './Confetti';
import { Button } from './Button';

interface Props {
  title: string;
  onReset: () => void;
  onRedownload: () => void;
  mobile?: boolean;
  onSaveToGallery?: () => void;
  saving?: boolean;
  preparing?: boolean;
  prepFailed?: boolean;
}

export function SuccessState({ title, onReset, onRedownload, mobile, onSaveToGallery, saving, preparing, prepFailed }: Props) {
  const busy = saving || preparing;
  const saveLabel = saving ? 'Opening share…' : prepFailed ? 'Retry Save to Gallery' : 'Save to Gallery';
  const heading = busy ? 'Saving to your gallery…' : 'Your download is ready! 🎉';

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

      <h3 className="mt-5 text-2xl font-bold text-slate-900">{heading}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
        <span className="line-clamp-1 font-medium text-slate-700">{title}</span>
        {mobile ? (
          busy ? (
            <>
              {' '}
              — converting for Photos and opening the share menu. Pick{' '}
              <strong className="font-medium text-slate-700">Save Video</strong> to add it to your gallery.
            </>
          ) : prepFailed ? (
            <>
              {' '}
              needs one more step. Tap{' '}
              <strong className="font-medium text-slate-700">Retry Save to Gallery</strong> below.
            </>
          ) : (
            <>
              {' '}
              was saved. Tap <strong className="font-medium text-slate-700">Save to Gallery</strong> if the share menu
              did not open, then pick <strong className="font-medium text-slate-700">Save Video</strong>.
            </>
          )
        ) : (
          <> has been saved to your device as an MP4 with sound.</>
        )}
      </p>

      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        {mobile && onSaveToGallery ? (
          <>
            {!busy && (
              <Button onClick={onSaveToGallery} disabled={saving}>
                {saveLabel}
              </Button>
            )}
            {busy && (
              <div className="flex items-center justify-center gap-2 text-sm font-medium text-indigo-600">
                <motion.span
                  className="h-2.5 w-2.5 rounded-full bg-indigo-500"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
                Preparing for Photos…
              </div>
            )}
            <Button variant="ghost" onClick={onRedownload} disabled={busy}>
              Save again
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onRedownload}>Download again</Button>
        )}
        <Button variant={mobile ? 'ghost' : undefined} onClick={onReset} disabled={busy}>
          Download another
        </Button>
      </div>
    </motion.div>
  );
}
