import { motion, AnimatePresence } from 'framer-motion';
import { useMemo, useState } from 'react';
import { COMPATIBLE_MAX_HEIGHT, type AvailableFormat, type CodecMode, type QualityId } from '../types';
import { formatBytes } from '../utils/format';
import { displaySourceMaxHeight } from '../utils/qualityAvailability';
import { isPro } from '../lib/license';
import { HIDE_PRO } from '../config/build';
import { FREE_TIER_MAX_HEIGHT } from '../lib/plan';

interface Props {
  formats: AvailableFormat[];
  selected: QualityId;
  onSelect: (q: QualityId) => void;
  mode: CodecMode;
  onModeChange: (m: CodecMode) => void;
  /** Max resolution height (px) the user may download. */
  maxHeight: number;
  /** True while real file sizes / availability are still loading. */
  refining?: boolean;
  /** False until yt-dlp info-json is warm — prevents a duplicate slow extraction on download. */
  downloadReady?: boolean;
  /** Mobile: download in progress — show preparing message. */
  saving?: boolean;
  /** When false the Download button is not rendered (e.g. mobile IG waiting for thumbnail). */
  showDownloadButton?: boolean;
  /** Starts the download of the selected quality (App handles Pro gating). */
  onDownload: () => void;
  /** Scroll/focus the inline Pro upgrade panel. */
  onUpgrade?: () => void;
  /** Switch back to the highest free quality without upgrading. */
  onUseFree?: () => void;
  /** Override download button label (e.g. clip range). */
  downloadLabel?: string;
  /** Disable download when clip inputs are invalid. */
  downloadDisabled?: boolean;
  /** Native max height from yt-dlp — drives honest availability for 2K/4K. */
  sourceMaxHeight?: number | null;
  /** When true, free users may still download 2K/4K (quota remaining). */
  freeHighResRemaining?: boolean;
}

/**
 * Quality cards (720p · 1080p · 2K · 4K) with a codec-mode toggle. Resolutions
 * above the free tier show a PRO lock until the user upgrades. Controlled by the
 * parent so the URL-bar Download button stays in sync.
 */
export function QualitySelector({ formats, selected, onSelect, mode, onModeChange, maxHeight, refining = false, downloadReady = true, saving = false, showDownloadButton = true, onDownload, onUpgrade, onUseFree, downloadLabel, downloadDisabled = false, sourceMaxHeight, freeHighResRemaining = false }: Props) {
  // Keep every tier clickable on first load — source height is advisory only (shown in the
  // helper text). Compatible mode still hides tiers above 1080p.
  const resolvedFormats = useMemo(
    () =>
      formats.map((f) => ({
        ...f,
        available: f.available !== false,
      })),
    [formats],
  );

  const sourceLabel =
    typeof sourceMaxHeight === 'number' && sourceMaxHeight > 0
      ? displaySourceMaxHeight(sourceMaxHeight)
      : null;

  // In compatible mode, only resolutions up to 1080p are offered (H.264 ceiling).
  // In the iOS build (HIDE_PRO) the paid tiers are removed entirely, so nothing
  // above the free-tier maxHeight is even shown — no PRO locks, no upsell.
  const visibleFormats = useMemo(
    () =>
      resolvedFormats
        // iOS build: free tiers only (no PRO cards — nothing can be purchased in-app).
        .filter((f) => !HIDE_PRO || f.height <= FREE_TIER_MAX_HEIGHT)
        .map((f) => ({
          ...f,
          available: f.available && (mode === 'best' || f.height <= COMPATIBLE_MAX_HEIGHT),
        })),
    [resolvedFormats, mode, maxHeight],
  );

  const pickDefault = (list: AvailableFormat[]): QualityId =>
    (list.find((f) => f.id === '1080' && f.available) ?? list.find((f) => f.available && f.height <= maxHeight) ?? list[0]).id;

  const handleModeChange = (next: CodecMode) => {
    onModeChange(next);
    const updated = resolvedFormats.map((f) => ({
      ...f,
      available: f.available && (next === 'best' || f.height <= COMPATIBLE_MAX_HEIGHT),
    }));
    if (!updated.find((f) => f.id === selected)?.available) onSelect(pickDefault(updated));
  };

  const selectedFmt = visibleFormats.find((f) => f.id === selected);
  const proUser = isPro();
  const needsUpgrade = Boolean(
    selectedFmt && selectedFmt.premium && !proUser && !freeHighResRemaining,
  );
  const highestFreeFmt = visibleFormats.filter((f) => f.available && f.height <= maxHeight).sort((a, b) => b.height - a.height)[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 }}
      className="space-y-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium uppercase tracking-wider text-slate-400">Choose quality</h3>
          {sourceLabel != null && !HIDE_PRO && (
            <p className="mt-1 text-xs text-slate-500">
              Source video is up to <span className="font-semibold text-slate-700">{sourceLabel}p</span>
              {sourceLabel < 2160 ? ' — 2K/4K only appear when the source supports them' : ''}
            </p>
          )}
        </div>
        <CodecToggle mode={mode} onChange={handleModeChange} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visibleFormats.map((f) => {
          const active = selected === f.id;
          const disabled = !f.available;
          const locked = f.premium && !proUser;
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
                active ? 'shadow-glow ring-1 ring-accent/60' : 'hover:bg-slate-50',
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
                <span className="absolute right-2.5 top-2.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-600">
                  <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="currentColor" aria-hidden="true">
                    <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 0 1 6 0v3Z" />
                  </svg>
                  PRO
                </span>
              )}

              <span className="text-lg font-bold text-slate-900">{f.label}</span>
              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-600">
                {f.tag}
              </span>

              {(disabled || (refining && f.estimatedBytes == null) || Boolean(f.estimatedBytes)) && (
                <span className={`mt-1 text-xs text-slate-500 ${refining && f.estimatedBytes == null ? 'shimmer relative overflow-hidden rounded' : ''}`}>
                  {disabled
                    ? mode === 'compatible' && f.height > COMPATIBLE_MAX_HEIGHT
                      ? 'Best-quality only'
                      : 'Not available'
                    : refining && f.estimatedBytes == null
                      ? 'Estimating size…'
                      : `≈ ${formatBytes(f.estimatedBytes)}`}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {showDownloadButton && (
      <>
      <RippleButton
        onClick={needsUpgrade ? (onUpgrade ?? onDownload) : onDownload}
        upgrade={needsUpgrade}
        disabled={(!downloadReady && !needsUpgrade) || saving || downloadDisabled}
      >
        {needsUpgrade ? (
          <>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5Zm3 8H9V6a3 3 0 0 1 6 0v3Z" />
            </svg>
            Unlock {selectedFmt?.label} — Go Pro
          </>
        ) : saving ? (
          <>Preparing your video, please wait…</>
        ) : !downloadReady ? (
          <>Preparing download…</>
        ) : (
          <>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
            </svg>
            {downloadLabel ? (
              <>
                Download {downloadLabel}
                <span className="text-sm font-normal text-white/75">· {selectedFmt?.label}</span>
              </>
            ) : (
              <>
                Download {selectedFmt?.label}
                <span className="text-sm font-normal text-white/75">· {mode === 'compatible' ? 'H.264' : 'best'}</span>
              </>
            )}
          </>
        )}
      </RippleButton>
      {needsUpgrade && onUseFree && highestFreeFmt && (
        <button
          type="button"
          onClick={onUseFree}
          className="w-full text-center text-sm font-medium text-slate-500 transition hover:text-slate-700"
        >
          Or download {highestFreeFmt.label} free instead
        </button>
      )}
      </>
      )}
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
            <span className={`relative z-10 ${active ? 'text-white' : 'text-slate-500 hover:text-slate-800'}`}>
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
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  upgrade?: boolean;
  disabled?: boolean;
}) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled) return;
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
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.2 }}
      className={[
        'relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl px-8 py-4 text-lg font-semibold text-white shadow-glow-soft transition-shadow',
        disabled ? 'cursor-not-allowed opacity-60' : 'hover:shadow-glow',
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
