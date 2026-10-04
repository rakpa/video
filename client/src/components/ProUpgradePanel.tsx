import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ApiError, createCheckout, fetchBillingConfig, type BillingConfig } from '../api/client';
import { navigate } from '../hooks/useRoute';
import { PaymentBadges } from './PaymentBadges';
import { Confetti } from './Confetti';
import { checkoutPlanForLabel } from '../lib/plan';

const formatYearlyPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

function splitYearlyPrice(cents: number) {
  const whole = Math.floor(cents / 100);
  const frac = (cents % 100).toString().padStart(2, '0');
  return { whole, frac };
}

interface Props {
  selectedQuality?: string;
  inline?: boolean;
  /** Inline only — lets the user skip Pro and keep downloading free. */
  onDismiss?: () => void;
}

const PERKS = [
  { icon: '4K', label: '4K downloads' },
  { icon: '2K', label: '2K & 1080p' },
  { icon: '✓', label: 'No watermark' },
  { icon: '∞', label: 'Unlimited' },
] as const;

/** Pro checkout panel — bold yearly value story with motion + graphics. */
export function ProUpgradePanel({ selectedQuality, inline = false, onDismiss }: Props) {
  const [cfg, setCfg] = useState<BillingConfig | null>(null);
  const [agree, setAgree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingConfig().then(setCfg).catch(() => setError('Could not load pricing.'));
  }, []);

  const tier = checkoutPlanForLabel(selectedQuality);
  const tierCents = cfg?.plans.pro.cents ?? 999;
  const perMonth = (tierCents / 12 / 100).toFixed(2);
  const { whole: priceWhole, frac: priceFrac } = splitYearlyPrice(tierCents);

  const startCheckout = async () => {
    setError(null);
    setBusy(true);
    try {
      const url = await createCheckout(tier);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  };

  return (
    <motion.div
      id={inline ? undefined : 'pro-checkout'}
      initial={inline ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={inline ? '' : 'mx-auto max-w-lg'}
    >
      {!inline && (
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-600">Pro · Yearly only</p>
          <h2 className="pro-pricing-headline mt-2 font-extrabold leading-tight tracking-tight text-slate-900">
            One tiny price. <span className="gradient-text">A full year</span> of Pro.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            {selectedQuality
              ? `${selectedQuality} needs Pro — unlock 2K & 4K for less than a coffee per month.`
              : 'One simple yearly plan. Download in 2K & 4K with sound.'}
          </p>
        </div>
      )}

      <div
        className={`relative overflow-hidden rounded-[1.75rem] border border-violet-200/80 bg-white shadow-[0_24px_60px_-24px_rgba(79,70,229,0.35)] ${
          inline ? 'mt-4' : 'mt-6'
        }`}
      >
        {/* Ambient graphics */}
        <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-violet-400/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-indigo-400/15 blur-3xl" aria-hidden="true" />
        <Sparkle className="pro-float absolute left-5 top-6 h-5 w-5 text-amber-400" />
        <Sparkle className="pro-float-delay absolute right-8 top-10 h-4 w-4 text-violet-400" />
        <FloatingBadge label="4K" className="pro-float absolute -left-1 top-[38%] hidden sm:flex" />
        <FloatingBadge label="2K" className="pro-float-delay absolute -right-1 top-[42%] hidden sm:flex" tone="blue" />

        <div className="relative p-5 sm:p-7">
          {inline && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="absolute right-4 top-4 z-10 rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Dismiss Pro upgrade"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          )}

          {/* Launch ribbon */}
          <div className="mb-5 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white shadow-md">
              Best deal
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              Less than Netflix for a month
            </span>
          </div>

          {/* Hero price card */}
          <div className="pro-pulse-ring relative overflow-hidden rounded-2xl border border-violet-300/60 bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 p-5 text-white shadow-glow sm:p-6">
            <div className="pro-price-shine pointer-events-none absolute inset-0" aria-hidden="true" />
            <div className="relative flex flex-col items-center text-center">
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-violet-200">Whole year access</p>

              <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
                className="mt-2 flex items-end justify-center gap-0.5 sm:gap-1"
              >
                <span className="text-[clamp(2.25rem,8vw,3.25rem)] font-black leading-none tracking-tight">
                  ${priceWhole}
                </span>
                <span className="mb-0.5 text-[clamp(1.125rem,3.5vw,1.5rem)] font-bold leading-none tracking-tight text-white/90">
                  .{priceFrac}
                </span>
                <span className="mb-1 text-xs font-semibold text-violet-200 sm:text-sm">/year</span>
              </motion.div>

              <p className="mt-1 text-sm font-medium text-violet-100">
                That&apos;s only <span className="font-bold text-white">${perMonth}/mo</span> — billed once yearly
              </p>
            </div>
          </div>

          {/* Value bullets */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PERKS.map((p, i) => (
              <motion.div
                key={p.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
                className="flex flex-col items-center rounded-xl border border-slate-100 bg-slate-50/80 px-2 py-3 text-center"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-gradient text-sm font-black text-white shadow-glow-soft">
                  {p.icon}
                </span>
                <span className="mt-1.5 text-[11px] font-semibold leading-tight text-slate-600">{p.label}</span>
              </motion.div>
            ))}
          </div>

          <p className="mt-4 text-center text-sm text-slate-500">
            <span className="font-semibold text-slate-700">365 days</span> of 2K &amp; 4K · cancel anytime
          </p>

          {error && (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-700">{error}</p>
          )}
          {cfg && !cfg.enabled && (
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-700">
              Payments aren&apos;t configured yet. Add your Stripe keys to <code>server/.env</code> to enable checkout.
            </p>
          )}

          <div className={inline ? undefined : 'flex justify-center'}>
            <motion.button
              type="button"
              onClick={startCheckout}
              disabled={busy || !agree || (cfg ? !cfg.enabled : false)}
              whileHover={{ scale: busy ? 1 : 1.02 }}
              whileTap={{ scale: 0.98 }}
              className={`btn-gradient relative mt-5 flex items-center justify-center gap-2 overflow-hidden font-bold text-white shadow-glow transition-shadow hover:shadow-[0_0_40px_rgba(124,58,237,0.45)] disabled:cursor-not-allowed disabled:opacity-60 ${
                inline
                  ? 'w-full rounded-2xl px-8 py-4 text-lg'
                  : 'rounded-full px-7 py-3 text-base'
              }`}
            >
              {busy ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Redirecting to checkout…
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                    <path d="m12 2 2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6L12 2Z" />
                  </svg>
                  Yes — {formatYearlyPrice(tierCents)} for Pro / year
                </>
              )}
            </motion.button>
          </div>

          <p className="mt-2 text-center text-xs text-slate-400">Billed yearly · renews automatically · cancel anytime</p>

          {inline && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="mt-3 w-full text-center text-sm font-medium text-slate-500 transition hover:text-slate-700"
            >
              Not now — continue with 1080p free
            </button>
          )}

          <PaymentBadges />

          <label className="mt-4 flex items-start justify-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 accent-accent"
            />
            <span>
              I agree to the{' '}
              <button type="button" onClick={() => navigate('/terms')} className="font-medium text-indigo-600 hover:underline">
                Terms of Service
              </button>{' '}
              and{' '}
              <button type="button" onClick={() => navigate('/refunds')} className="font-medium text-indigo-600 hover:underline">
                Refund Policy
              </button>
              . Prices exclude VAT where applicable.
            </span>
          </label>
        </div>
      </div>
    </motion.div>
  );
}

/** Exposed so parents can flip the success UI after Stripe redirect redeem. */
export function ProUpgradeSuccess({ selectedQuality, onDismiss }: { selectedQuality?: string; onDismiss?: () => void }) {
  return (
    <div className="glass relative overflow-hidden rounded-3xl p-6 text-center shadow-card">
      <Confetti />
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-gradient shadow-glow">
        <svg viewBox="0 0 24 24" className="h-7 w-7 text-white" fill="currentColor" aria-hidden="true">
          <path d="m12 2 2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6L12 2Z" />
        </svg>
      </div>
      <h2 className="mt-4 text-xl font-bold text-slate-900">Welcome to Pro!</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
        {selectedQuality ? `${selectedQuality} and all Pro qualities` : '2K and 4K'} are unlocked for a full year.
      </p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="btn-gradient mt-5 rounded-2xl px-6 py-3 font-semibold text-white shadow-glow-soft"
        >
          Continue downloading
        </button>
      )}
    </div>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 2l1.8 5.5L19 9.3l-5.2 1.8L12 16.6 10.2 11 5 9.3l5.2-1.8L12 2Z" />
    </svg>
  );
}

function FloatingBadge({ label, className, tone = 'violet' }: { label: string; className?: string; tone?: 'violet' | 'blue' }) {
  const bg = tone === 'blue' ? 'from-blue-500 to-cyan-500' : 'from-violet-500 to-fuchsia-500';
  return (
    <div
      className={`z-10 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${bg} text-xs font-black text-white shadow-lg ring-2 ring-white ${className ?? ''}`}
      aria-hidden="true"
    >
      {label}
    </div>
  );
}
