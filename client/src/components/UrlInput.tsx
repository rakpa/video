import { motion, AnimatePresence } from 'framer-motion';
import { useMemo } from 'react';
import { detectPlatform } from '../utils/platform';
import { PlatformIcon } from './PlatformIcon';
import { HIDE_PRO } from '../config/build';

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** True while the pasted link is being read — shows progress right under the box. */
  loading?: boolean;
}

/**
 * The hero centerpiece: a large URL field with live platform detection. The
 * video auto-loads as you paste a valid link; downloads happen from the
 * QualitySelector below once the video preview is ready.
 */
export function UrlInput({ value, onChange, loading = false }: Props) {
  const platform = useMemo(() => detectPlatform(value), [value]);

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
  // Typed/pasted text that is clearly not a supported link — say so instead of
  // sitting silently (no request is made until a platform is recognised).
  const unsupported = !empty && !platform && value.trim().length >= 8;

  return (
    <div className="w-full">
      <div className="relative flex items-center gap-3 rounded-2xl border-2 border-indigo-400/80 bg-white p-2 pl-4 shadow-glow-soft ring-1 ring-indigo-200/50 transition-all duration-200 focus-within:border-indigo-500 focus-within:shadow-glow focus-within:ring-2 focus-within:ring-indigo-300/40">
        {/* Leading platform / link icon */}
        <AnimatePresence mode="wait">
          {platform ? (
            <motion.span
              key={platform.id}
              initial={{ scale: 0.5, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
              style={{ boxShadow: `0 0 0 1px ${platform.color}33, 0 0 14px ${platform.color}33` }}
              title={platform.label}
            >
              <PlatformIcon platform={platform.id} className="h-6 w-6" />
            </motion.span>
          ) : (
            <motion.span
              key="link"
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              className="grid h-9 w-9 shrink-0 place-items-center text-slate-400"
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
          aria-label="Video URL"
          placeholder={HIDE_PRO ? 'Paste a video link…' : 'Paste a YouTube, Facebook or Instagram link…'}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full flex-1 bg-transparent py-3 pr-2 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none sm:min-w-[18rem]"
        />

        {/* One-tap paste shortcut — only while the field is empty. */}
        {empty && (
          <button
            type="button"
            onClick={handlePaste}
            className="mr-1 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="8" y="4" width="8" height="4" rx="1" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 6h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
            </svg>
            Paste
          </button>
        )}
        {!empty && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear link"
            className="mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-900"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </div>
      {loading && platform && (
        <div role="status" aria-live="polite" className="mt-3">
          <div className="flex items-center justify-center gap-2.5 text-sm font-semibold text-indigo-600">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            Getting your {platform.label} video…
          </div>
          <div className="url-loading-track mt-2.5 h-1.5 overflow-hidden rounded-full bg-indigo-100">
            <div className="url-loading-bar h-full w-1/3 rounded-full bg-accent-gradient" />
          </div>
        </div>
      )}
      {unsupported && (
        <p role="alert" className="mt-3 text-center text-sm font-medium text-rose-600">
          That doesn’t look like a YouTube, Facebook or Instagram link.
        </p>
      )}
    </div>
  );
}
