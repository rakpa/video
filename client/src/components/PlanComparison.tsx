import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ApiError, createCheckout, fetchBillingConfig, type BillingConfig } from '../api/client';
import { navigate } from '../hooks/useRoute';

interface Feature {
  label: string;
  free: boolean;
  pro: boolean;
}

const FEATURES: Feature[] = [
  { label: '720p & 1080p video downloads', free: true, pro: true },
  { label: '2K (1440p) downloads', free: false, pro: true },
  { label: '4K (2160p) downloads', free: false, pro: true },
  { label: 'Merged MP4 with sound', free: true, pro: true },
  { label: 'No watermarks', free: true, pro: true },
  { label: 'MP3 audio extraction', free: false, pro: true },
  { label: 'Unlimited downloads', free: false, pro: true },
  { label: 'Priority processing', free: false, pro: true },
  { label: 'YouTube, Facebook & Instagram', free: true, pro: true },
  { label: 'No sign-up required', free: true, pro: true },
];

const EXTRA_PRO_FEATURE = '365 days access · cancel anytime';

function FeatureIcon({ included, highlight }: { included: boolean; highlight?: boolean }) {
  if (included) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={`h-5 w-5 shrink-0 ${highlight ? 'text-violet-200' : 'text-emerald-500'}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 shrink-0 ${highlight ? 'text-violet-300/50' : 'text-slate-300'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function ExtraProFeatureRow({ highlight = false, hidden = false }: { highlight?: boolean; hidden?: boolean }) {
  return (
    <li
      className={`flex items-start gap-2.5 border-t pt-3 ${
        hidden ? 'pointer-events-none invisible border-transparent' : highlight ? 'border-white/15' : 'border-slate-200'
      }`}
      aria-hidden={hidden}
    >
      <FeatureIcon included highlight={highlight} />
      <span className={`text-sm font-medium leading-snug ${highlight ? 'text-violet-100' : 'text-slate-700'}`}>
        {EXTRA_PRO_FEATURE}
      </span>
    </li>
  );
}

/** Page hero — full-width headline above the pricing grid. */
export function PricingHero() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-6 text-center"
    >
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
        <span className="gradient-text">$19.99/year</span> — serious quality, fair price
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
        Lightning-fast URL loading and downloads — paste a link and save in seconds. Start free at 1080p; one yearly
        payment unlocks 2K, 4K &amp; MP3 for about $1.67 a month.
      </p>
    </motion.div>
  );
}

/** Free vs Pro — equal-height cards with aligned CTAs. */
export function PlanComparisonTable() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
      <FreePlanColumn />
      <ProPlanColumn />
    </div>
  );
}

function FreePlanColumn() {
  return (
    <div className="flex min-w-0 flex-1">
      <div className="glass flex h-full w-full flex-col overflow-hidden rounded-3xl shadow-card">
        <div className="shrink-0 border-b border-slate-200 px-5 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Free</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">$0</p>
          <p className="mt-1 text-sm text-slate-500">Forever — no card needed</p>
        </div>

        <ul className="flex shrink-0 flex-col gap-3 px-5 py-5 sm:px-6">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex items-start gap-2.5">
              <FeatureIcon included={f.free} />
              <span className={`text-sm leading-snug ${f.free ? 'text-slate-700' : 'text-slate-400'}`}>{f.label}</span>
            </li>
          ))}
          <ExtraProFeatureRow hidden />
        </ul>

        <div className="mt-auto shrink-0 border-t border-slate-200 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Start downloading free
          </button>
        </div>
      </div>
    </div>
  );
}

function ProPlanColumn() {
  const [cfg, setCfg] = useState<BillingConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingConfig().then(setCfg).catch(() => setError('Could not load pricing.'));
  }, []);

  const yearlyCents = cfg?.plans.yearly.cents ?? 1999;
  const yearlyPrice = `$${(yearlyCents / 100).toFixed(2)}`;

  const startCheckout = async () => {
    setError(null);
    setBusy(true);
    try {
      const url = await createCheckout('yearly');
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-1">
      <div className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-violet-200/80 bg-gradient-to-b from-indigo-600 via-violet-600 to-purple-700 text-white shadow-[0_24px_60px_-24px_rgba(79,70,229,0.45)]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <div className="relative shrink-0 border-b border-white/15 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Pro</p>
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
              Best deal
            </span>
          </div>
          <p className="mt-1 text-3xl font-black tracking-tight">
            {yearlyPrice}<span className="text-lg font-bold text-violet-200">/year</span>
          </p>
          <p className="mt-1 text-sm text-violet-100">Only ${(yearlyCents / 12 / 100).toFixed(2)}/mo — billed once yearly</p>
        </div>

        <ul className="relative flex shrink-0 flex-col gap-3 px-5 py-5 sm:px-6">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex items-start gap-2.5">
              <FeatureIcon included={f.pro} highlight />
              <span className={`text-sm leading-snug ${f.pro ? 'text-white' : 'text-violet-300/60'}`}>{f.label}</span>
            </li>
          ))}
          <ExtraProFeatureRow highlight />
        </ul>

        <div className="mt-auto shrink-0 border-t border-white/15 px-5 py-4 sm:px-6">
          {error && (
            <p className="mb-3 rounded-xl border border-rose-200/50 bg-rose-50/95 p-2.5 text-center text-xs text-rose-700">{error}</p>
          )}

          <button
            type="button"
            onClick={() => void startCheckout()}
            disabled={busy || (cfg ? !cfg.enabled : false)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-semibold text-violet-700 transition hover:border-white hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-300 border-t-violet-700" />
                Redirecting to checkout…
              </>
            ) : (
              <>Buy Pro — {yearlyPrice}/year</>
            )}
          </button>

          <p className="mt-2 text-center text-xs text-violet-200">
            One payment · 12 months · secured by Stripe
          </p>
        </div>
      </div>
    </div>
  );
}

/** Stacked hero + table — used where a single column is enough. */
export function PlanComparison() {
  return (
    <section className="mx-auto mt-6 max-w-2xl">
      <PricingHero />
      <div className="mt-10">
        <PlanComparisonTable />
      </div>
    </section>
  );
}
