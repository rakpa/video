import { motion } from 'framer-motion';

interface Props {
  message: string;
  onDismiss?: () => void;
  /** Re-runs the failed fetch. When provided, a "Try again" action appears. */
  onRetry?: () => void;
}

/** Friendly, non-technical error banner. Never shows raw stack traces. */
export function ErrorBanner({ message, onDismiss, onRetry }: Props) {
  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="glass flex items-start gap-3 rounded-2xl border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-700 dark:text-rose-100"
    >
      <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-rose-500 dark:text-rose-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 8v5m0 3h.01" />
      </svg>
      <div className="flex-1">
        <p className="leading-relaxed">{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/25 dark:text-rose-100"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 3-6.7L3 8m0 0V3m0 5h5" />
            </svg>
            Try again
          </button>
        )}
      </div>
      {onDismiss && (
        <button onClick={onDismiss} aria-label="Dismiss error" className="text-rose-500/70 transition hover:text-rose-700 dark:text-rose-200/70 dark:hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </motion.div>
  );
}
