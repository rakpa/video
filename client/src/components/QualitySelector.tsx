import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import { COMPATIBLE_MAX_HEIGHT, type AvailableFormat, type CodecMode, type QualityId } from '../types';
import { formatBytes } from '../utils/format';

interface Props {
  formats: AvailableFormat[];
  selected: QualityId;
  onSelect: (q: QualityId) => void;
  mode: CodecMode;
  onModeChange: (m: CodecMode) => void;
  /** Whether the user currently holds a Pro license (unlocks premium qualities). */
  pro: boolean;
  /** True while real file sizes / availability are still loading. */
  refining?: boolean;
  /** Starts the download of the selected quality (App handles Pro gating). */
  onDownload: () => void;
  /** Scroll/focus the inline Pro upgrade panel. */
  onUpgrade?: () => void;
}

/**
 * Quality cards (720p · 1080p · 2K · 4K) with a codec-mode toggle. Resolutions
 * above the free tier show a PRO lock until the user upgrades. Controlled by the
 * parent so the URL-bar Download button stays in sync.
 */
export function QualitySelector({ formats, selected, onSelect, mode, onModeChange, pro, refining = false, onDownload, onUpgrade }: Props) {
  // In compatible mode, only resolutions up to 1080p are offered (H.264 ceiling).
  const visibleFormats = useMemo(
    () =>
      formats.map((f) => ({
        ...f,
        available: f.available && (mode === 'best' || f.height <= COMPATIBLE_MAX_HEIGHT),
      })),
    [formats, mode],
  );

  const pickDefault = (list: AvailableFormat[]): QualityId =>
    (list.find((f) => f.id === '1080' && f.available) ?? list.find((f) => f.available) ?? list[0]).id;

  const handleModeChange = (next: CodecMode) => {
    onModeChange(next);
    const updated = formats.map((f) => ({
      ...f,
      available: f.available && (next === 'best' || f.height <= COMPATIBLE_MAX_HEIGHT),
    }));
    if (!updated.find((f) => f.id === selected)?.available) onSelect(pickDefault(updated));
  };

  const selectedFmt = visibleFormats.find((f) => f.id === selected);
  const needsUpgrade = Boolean(selectedFmt?.premium && !pro);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="space-y-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-medium uppercase tracking-wider text-white/50">Choose quality</h3>
        <CodecToggle mode={mode} onChange={handleModeChange} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visibleFormats.map((f) => {
          const active = selected === f.id;
          const disabled = !f.available;
          const locked = f.premium && !pro;
          return (
            <motion.button
              key={f.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(f.id)}
              aria-pressed={active}
              whileHover={disabled ? undefined : { scale: 1.03 }}
              whileTap={disabled ? undefined : { scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className={[
                'glass relative flex flex-col items-start gap-1 rounded-2xl p-4 text-left transition-all',
                active ? 'shadow-glow ring-1 ring-accent/60' : 'hover:bg-white/[0.07]',
                disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
              ].join(' ')}
            >
              {/* Active checkmark, or a PRO lock for premium tiers */}
              <AnimatePresence>
                {active && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                    className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-accent-gradient text-white"
                  >
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                    </svg>
                  </motion.span>
                )}
              </AnimatePresence>
              {!active && locked && (
                <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                  <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                    <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 0 1 6 0v3Z" />
                  </svg>
                  PRO
                </span>
              )}

              <span className="text-lg font-bold text-white">{f.label}</span>
              <span className="rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-400">
                {f.tag}
              </span>

              <span className={`mt-1 text-xs text-white/50 ${refining && f.estimatedBytes == null ? 'shimmer relative overflow-hidden rounded' : ''}`}>
                {disabled
                  ? mode === 'compatible' && f.height > COMPATIBLE_MAX_HEIGHT
                    ? 'Best-quality only'
                    : 'Not available'
                  : refining && f.estimatedBytes == null
                    ? 'Estimating size…'
                    : `≈ ${formatBytes(f.estimatedBytes)}`}
              </span>

              {!disabled && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300/90">
                  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="currentColor" aria-hidden="true">
                    <path d="M3 10v4h4l5 5V5L7 10H3Zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z" />
                  </svg>
                  with sound
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      <RippleButton onClick={needsUpgrade ? (onUpgrade ?? onDownload) : onDownload} upgrade={needsUpgrade}>
        {needsUpgrade ? (
          <>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 0 1 6 0v3Z" />
            </svg>
            Unlock {selectedFmt?.label} — Go Pro
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
            </svg>
            Download {selectedFmt?.label}
            <span className="text-sm font-normal text-white/75">· {mode === 'compatible' ? 'H.264' : 'best'}</span>
          </>
        )}
      </RippleButton>
    </motion.div>
  );
}

/** Segmented control switching between best-quality and most-compatible codecs. */
function CodecToggle({ mode, onChange }: { mode: CodecMode; onChange: (m: CodecMode) => void }) {
  const options: { id: CodecMode; label: string; hint: string }[] = [
    { id: 'best', label: 'Best quality', hint: 'VP9/AV1 · up to 4K' },
    { id: 'compatible', label: 'Most compatible', hint: 'H.264 · up to 1080p' },
  ];

  return (
    <div role="radiogroup" aria-label="Codec preference" className="glass inline-flex rounded-full p-1 text-xs">
      {options.map((o) => {
        const active = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            title={o.hint}
            className="relative rounded-full px-3 py-1.5 font-medium transition-colors"
          >
            {active && (
              <motion.span
                layoutId="codec-pill"
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                className="absolute inset-0 rounded-full bg-accent-gradient shadow-glow-soft"
              />
            )}
            <span className={`relative z-10 ${active ? 'text-white' : 'text-white/55 hover:text-white/80'}`}>
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Gradient button with a ripple burst on click for tactile feedback. */
function RippleButton({
  children,
  onClick,
  upgrade,
}: {
  children: React.ReactNode;
  onClick: () => void;
  upgrade?: boolean;
}) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now();
    setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 600);
    onClick();
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className={[
        'relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl px-8 py-4 text-lg font-semibold text-white shadow-glow-soft transition-shadow hover:shadow-glow',
        upgrade ? 'bg-gradient-to-r from-amber-500 to-orange-500' : 'btn-gradient',
      ].join(' ')}
    >
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          initial={{ scale: 0, opacity: 0.5 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-none absolute h-24 w-24 rounded-full bg-white/40"
          style={{ left: r.x - 48, top: r.y - 48 }}
        />
      ))}
      {children}
    </motion.button>
  );
}
