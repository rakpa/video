import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ApiError, createCheckout, fetchBillingConfig, type BillingConfig, type CheckoutPlan } from '../api/client';
import { navigate } from '../hooks/useRoute';

const TIER_FEATURES = [
  'Merged MP4 with sound',
  'No watermarks',
  'YouTube, Facebook & Instagram',
  'No sign-up required',
];

type TierId = 'free' | CheckoutPlan;

interface TierDef {
  id: TierId;
  name: string;
  price: string;
  sub: string;
  maxLabel: string;
  highlight?: boolean;
}

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
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
        Pick your <span className="gradient-text">quality tier</span>
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
        Paste a URL — your thumbnail loads in a flash. Pick a quality, hit download, and save straight to your gallery.
        Free starts at 720p; upgrade for HD, 2K or 4K.
      </p>
    </motion.div>
  );
}

/** Free + HD + 2K + 4K plan columns. */
export function PlanComparisonTable() {
  const [cfg, setCfg] = useState<BillingConfig | null>(null);

  useEffect(() => {
    fetchBillingConfig().then(setCfg).catch(() => undefined);
  }, []);

  const hdCents = cfg?.plans.hd.cents ?? 1000;
  const k2Cents = cfg?.plans['2k'].cents ?? 1999;
  const k4Cents = cfg?.plans['4k'].cents ?? 2999;

  const tiers: TierDef[] = [
    { id: 'free', name: 'Free', price: '$0', sub: 'Forever — no card needed', maxLabel: 'Up to 720p' },
    { id: 'hd', name: 'HD', price: `${formatPrice(hdCents)}/year`, sub: `${formatPrice(Math.round(hdCents / 12))}/mo billed yearly`, maxLabel: 'Up to 1080p Full HD' },
    { id: '2k', name: '2K', price: `${formatPrice(k2Cents)}/year`, sub: `${formatPrice(Math.round(k2Cents / 12))}/mo billed yearly`, maxLabel: 'Up to 2K (1440p)', highlight: true },
    { id: '4k', name: '4K', price: `${formatPrice(k4Cents)}/year`, sub: `${formatPrice(Math.round(k4Cents / 12))}/mo billed yearly`, maxLabel: 'Up to 4K (2160p)' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 xl:gap-5">
      {tiers.map((tier) => (
        <TierCard key={tier.id} tier={tier} billingEnabled={cfg?.enabled ?? false} />
      ))}
    </div>
  );
}

function TierCard({ tier, billingEnabled }: { tier: TierDef; billingEnabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPro = tier.id !== 'free';
  const highlighted = tier.highlight;

  const startCheckout = async () => {
    if (tier.id === 'free') return;
    setError(null);
    setBusy(true);
    try {
      const url = await createCheckout(tier.id);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  };

  return (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-3xl border shadow-card ${
        highlighted
          ? 'border-violet-300 bg-gradient-to-b from-indigo-600 via-violet-600 to-purple-700 text-white shadow-[0_24px_60px_-24px_rgba(79,70,229,0.45)]'
          : 'glass border-slate-200'
      }`}
    >
      <div className={`shrink-0 border-b px-5 py-5 sm:px-6 ${highlighted ? 'border-white/15' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <p className={`text-xs font-semibold uppercase tracking-[0.2em] ${highlighted ? 'text-violet-200' : 'text-slate-400'}`}>
            {tier.name}
          </p>
          {highlighted && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
              Popular
            </span>
          )}
        </div>
        <p className={`mt-1 text-2xl font-black tracking-tight ${highlighted ? 'text-white' : 'text-slate-900'}`}>{tier.price}</p>
        <p className={`mt-1 text-sm ${highlighted ? 'text-violet-100' : 'text-slate-500'}`}>{tier.sub}</p>
      </div>

      <ul className="flex shrink-0 flex-col gap-3 px-5 py-5 sm:px-6">
        <li className="flex items-start gap-2.5">
          <CheckIcon highlight={highlighted} />
          <span className={`text-sm font-semibold ${highlighted ? 'text-white' : 'text-slate-800'}`}>{tier.maxLabel}</span>
        </li>
        {TIER_FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <CheckIcon highlight={highlighted} />
            <span className={`text-sm leading-snug ${highlighted ? 'text-violet-100' : 'text-slate-600'}`}>{f}</span>
          </li>
        ))}
        {isPro && (
          <li className="flex items-start gap-2.5 border-t pt-3 border-white/15">
            <CheckIcon highlight={highlighted} />
            <span className={`text-sm ${highlighted ? 'text-violet-100' : 'text-slate-600'}`}>MP3 extract · unlimited · priority</span>
          </li>
        )}
      </ul>

      <div className={`mt-auto shrink-0 border-t px-5 py-4 sm:px-6 ${highlighted ? 'border-white/15' : 'border-slate-200'}`}>
        {error && (
          <p className="mb-3 rounded-xl border border-rose-200/50 bg-rose-50/95 p-2.5 text-center text-xs text-rose-700">{error}</p>
        )}
        {tier.id === 'free' ? (
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Start downloading free
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startCheckout()}
            disabled={busy || !billingEnabled}
            className={`flex w-full items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              highlighted
                ? 'border-white/40 bg-white text-violet-700 hover:border-white hover:bg-violet-50'
                : 'border-violet-200 bg-violet-600 text-white hover:bg-violet-700'
            }`}
          >
            {busy ? 'Redirecting…' : `Get ${tier.name} — ${tier.price}`}
          </button>
        )}
      </div>
    </div>
  );
}

function CheckIcon({ highlight }: { highlight?: boolean }) {
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

/** Stacked hero + table — used where a single column is enough. */
export function PlanComparison() {
  return (
    <section className="mx-auto mt-6 max-w-6xl">
      <PricingHero />
      <div className="mt-10">
        <PlanComparisonTable />
      </div>
    </section>
  );
}
