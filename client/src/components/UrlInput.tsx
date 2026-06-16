import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import { detectPlatform } from '../utils/platform';
import { PlatformIcon } from './PlatformIcon';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Drives the button: idle (no video yet), fetching, ready (video loaded), downloading. */
  status: 'idle' | 'fetching' | 'ready' | 'downloading';
  /** Starts the download of the currently selected quality. */
  onDownload: () => void;
}

/**
 * The hero centerpiece: a large URL field with live platform detection. The
 * video auto-loads as you paste a valid link, and the primary button becomes a
 * Download button once the video is ready.
 */
export function UrlInput({ value, onChange, status, onDownload }: Props) {
  const platform = useMemo(() => detectPlatform(value), [value]);
  const ready = status === 'ready';

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && ready) onDownload();
  };

  /** Read a link straight from the clipboard — a one-tap shortcut, esp. on mobile. */
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onChange(text.trim());
    } catch {
      /* Clipboard permission denied — the field still accepts a manual paste. */
    }
  };

  const empty = value.trim().length === 0;

  return (
    <div className="w-full">
      <div className="relative flex flex-col gap-3 rounded-none border-2 border-accent/70 bg-white p-2 shadow-glow-soft transition-shadow focus-within:border-accent focus-within:shadow-glow sm:flex-row sm:items-stretch sm:gap-0 sm:p-0 sm:pl-6">
        {/* Leading platform / link icon */}
        <div className="flex flex-1 items-center gap-3 pl-3 sm:py-1 sm:pl-0">
          <AnimatePresence mode="wait">
            {platform ? (
              <motion.span
                key={platform.id}
                initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0.5, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                className="grid h-9 w-9 place-items-center rounded-full"
                style={{ boxShadow: `0 0 0 1px ${platform.color}40, 0 0 18px ${platform.color}55` }}
                title={platform.label}
              >
                <PlatformIcon platform={platform.id} className="h-6 w-6" />
              </motion.span>
            ) : (
              <motion.span
                key="link"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                className="grid h-9 w-9 place-items-center text-slate-400"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
                  <path strokeLinecap="round" d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
                </svg>
              </motion.span>
            )}
          </AnimatePresence>

          <input
            type="url"
            inputMode="url"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKey}
            disabled={status === 'downloading'}
            aria-label="Video URL"
            placeholder="Paste a YouTube, Facebook or Instagram link…"
            className="w-full flex-1 bg-transparent py-3 pr-2 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50 sm:min-w-[18rem]"
          />

          {/* One-tap paste shortcut — only while the field is empty. */}
          {empty && (
            <button
              type="button"
              onClick={handlePaste}
              className="mr-1 inline-flex shrink-0 items-center gap-1.5 rounded-none bg-slate-900/5 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-900/10 hover:text-slate-900 sm:mr-3"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="8" y="4" width="8" height="4" rx="1" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 6h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
              </svg>
              Paste
            </button>
          )}
        </div>

        {/* Primary CTA — auto-becomes Download once the video loads. Flush in the bar. */}
        <motion.button
          type="button"
          onClick={onDownload}
          disabled={!ready}
          whileHover={{ scale: ready ? 1.02 : 1 }}
          whileTap={{ scale: ready ? 0.98 : 1 }}
          transition={{ duration: 0.2 }}
          className="btn-gradient relative flex shrink-0 items-center justify-center gap-2 self-stretch rounded-none px-8 py-3.5 font-semibold text-white shadow-glow-soft transition-shadow hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-70 sm:py-4 sm:pl-7 sm:pr-8 sm:text-[15px]"
        >
          {status === 'fetching' ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Loading…
            </>
          ) : status === 'downloading' ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Downloading…
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
              </svg>
              Download
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
