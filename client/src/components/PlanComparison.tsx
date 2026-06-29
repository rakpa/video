import { motion } from 'framer-motion';
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
        Start free at 1080p. One yearly payment unlocks 2K, 4K &amp; MP3 — about $1.67 a month.
      </p>
    </motion.div>
  );
}

/** Free vs Pro — two plan columns with feature lists. */
export function PlanComparisonTable() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
      {/* Free column */}
      <div className="glass flex flex-col overflow-hidden rounded-3xl shadow-card">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Free</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-slate-900">$0</p>
          <p className="mt-1 text-sm text-slate-500">Forever — no card needed</p>
        </div>
        <ul className="flex flex-1 flex-col gap-3 px-5 py-5 sm:px-6">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex items-start gap-2.5">
              <FeatureIcon included={f.free} />
              <span className={`text-sm leading-snug ${f.free ? 'text-slate-700' : 'text-slate-400'}`}>{f.label}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-slate-200 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            Start downloading free
          </button>
        </div>
      </div>

      {/* Pro column */}
      <div className="relative flex flex-col overflow-hidden rounded-3xl border border-violet-200/80 bg-gradient-to-b from-indigo-600 via-violet-600 to-purple-700 text-white shadow-[0_24px_60px_-24px_rgba(79,70,229,0.45)]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
        <div className="relative border-b border-white/15 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">Pro</p>
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">
              Best deal
            </span>
          </div>
          <p className="mt-1 text-3xl font-black tracking-tight">
            $19.99<span className="text-lg font-bold text-violet-200">/year</span>
          </p>
          <p className="mt-1 text-sm text-violet-100">Only $1.67/mo — billed once yearly</p>
        </div>
        <ul className="relative flex flex-1 flex-col gap-3 px-5 py-5 sm:px-6">
          {FEATURES.map((f) => (
            <li key={f.label} className="flex items-start gap-2.5">
              <FeatureIcon included={f.pro} highlight />
              <span className={`text-sm leading-snug ${f.pro ? 'text-white' : 'text-violet-300/60'}`}>{f.label}</span>
            </li>
          ))}
          <li className="flex items-start gap-2.5 border-t border-white/15 pt-3">
            <FeatureIcon included highlight />
            <span className="text-sm font-medium text-violet-100">365 days access · cancel anytime</span>
          </li>
        </ul>
        <div className="relative border-t border-white/15 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => document.getElementById('pro-checkout')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="w-full rounded-2xl border border-white/40 bg-white px-4 py-3 text-sm font-semibold text-violet-700 transition hover:border-white hover:bg-violet-50"
          >
            Buy Pro — $19.99/year
          </button>
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
