import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ApiError,
  createCheckout,
  fetchBillingConfig,
  pingApiWarmup,
  type BillingConfig,
} from '../api/client';

const TIER_FEATURES = [
  'Merged MP4 with sound',
  'No watermarks',
  'YouTube, Facebook & Instagram',
  'No sign-up required',
];

const PRO_FEATURES = ['MP3 extract · unlimited · priority'];

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0 text-violet-200"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}

interface Props {
  /** Inline below quality picker — shows a link to stay on free HD. */
  onDismiss?: () => void;
}

/** Pro plan card — same design as the pricing page, shown when 2K/4K is selected. */
export function ProUpgradeCard({ onDismiss }: Props) {
  const [cfg, setCfg] = useState<BillingConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Pre-created Stripe Checkout URL so clicking "Get Pro" redirects instantly. */
  const checkoutUrl = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Wake the (free-tier) backend and pre-create the checkout session the moment
    // this card appears, so the user's click is a fast redirect, not a cold start.
    pingApiWarmup();
    fetchBillingConfig()
      .then((c) => {
        if (!cancelled) setCfg(c);
      })
      .catch(() => undefined);
    createCheckout('pro')
      .then((url) => {
        if (!cancelled) checkoutUrl.current = url;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const proCents = cfg?.plans.pro.cents ?? 1999;
  const price = `${formatPrice(proCents)}/year`;
  const sub = `${formatPrice(Math.round(proCents / 12))}/mo billed yearly`;

  const startCheckout = async () => {
    setError(null);
    // Use the pre-created session if it's ready → instant redirect.
    if (checkoutUrl.current) {
      window.location.href = checkoutUrl.current;
      return;
    }
    setBusy(true);
    try {
      const url = await createCheckout('pro');
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mx-auto w-full max-w-sm"
    >
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-violet-300 bg-gradient-to-b from-indigo-600 via-violet-600 to-purple-700 text-white shadow-[0_24px_60px_-24px_rgba(79,70,229,0.45)]">
        <div className="shrink-0 border-b border-white/15 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Pro</p>
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
              Popular
            </span>
          </div>
          <p className="mt-1 text-2xl font-black tracking-tight text-white">{price}</p>
          <p className="mt-1 text-sm text-violet-100">{sub}</p>
        </div>

        <ul className="flex shrink-0 flex-col gap-3 px-5 py-5 sm:px-6">
          <li className="flex items-start gap-2.5">
            <CheckIcon />
            <span className="text-sm font-semibold text-white">Up to 2K &amp; 4K</span>
          </li>
          {TIER_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <CheckIcon />
              <span className="text-sm leading-snug text-violet-100">{f}</span>
            </li>
          ))}
          {PRO_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5 border-t border-white/15 pt-3">
              <CheckIcon />
              <span className="text-sm text-violet-100">{f}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto shrink-0 border-t border-white/15 px-5 py-4 sm:px-6">
          {error && (
            <p className="mb-3 rounded-xl border border-rose-200/50 bg-rose-50/95 p-2.5 text-center text-xs text-rose-700">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={() => void startCheckout()}
            disabled={busy || (cfg ? !cfg.enabled : false)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-semibold text-violet-700 transition hover:border-white hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Redirecting…' : `Get Pro — ${price}`}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="mt-3 w-full text-center text-sm font-medium text-violet-200 transition hover:text-white"
            >
              Or download 1080p free instead
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
