import { motion } from 'framer-motion';
import { navigate } from '../hooks/useRoute';
import { ProUpgradeCard } from './ProUpgradeCard';

const TIER_FEATURES = [
  'Merged MP4 with sound',
  'No watermarks',
  'YouTube, Facebook & Instagram',
  'No sign-up required',
];

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
        Simple <span className="gradient-text">pricing</span>
      </h1>
      <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
        Paste a URL — your thumbnail loads in a flash. Pick a quality, hit download, and save straight to your gallery.
        Free includes HD; upgrade to Pro for 2K &amp; 4K.
      </p>
    </motion.div>
  );
}

/** Free + Pro plan columns. */
export function PlanComparisonTable() {
  return (
    <div className="mx-auto grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
      <FreeTierCard />
      <ProUpgradeCard />
    </div>
  );
}

function FreeTierCard() {
  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200 shadow-card">
      <div className="shrink-0 border-b border-slate-200 px-5 py-5 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Free</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-slate-900">$0</p>
        <p className="mt-1 text-sm text-slate-500">Forever — no card needed</p>
      </div>

      <ul className="flex shrink-0 flex-col gap-3 px-5 py-5 sm:px-6">
        <li className="flex items-start gap-2.5">
          <CheckIcon />
          <span className="text-sm font-semibold text-slate-800">Up to 1080p Full HD</span>
        </li>
        {TIER_FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <CheckIcon />
            <span className="text-sm leading-snug text-slate-600">{f}</span>
          </li>
        ))}
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
