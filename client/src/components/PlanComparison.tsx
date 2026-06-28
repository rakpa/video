import { motion } from 'framer-motion';

type Cell = boolean | string;

interface Row {
  label: string;
  free: Cell;
  pro: Cell;
}

const ROWS: Row[] = [
  { label: 'Maximum quality', free: 'Up to 1080p', pro: 'Up to 4K' },
  { label: 'Merged MP4 with sound', free: true, pro: true },
  { label: 'No watermarks', free: true, pro: true },
  { label: 'MP3 audio extraction', free: false, pro: true },
  { label: 'Unlimited downloads', free: false, pro: true },
  { label: 'Priority processing', free: false, pro: true },
];

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}
function Cross() {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4 text-slate-300" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function renderCell(c: Cell) {
  if (typeof c === 'string') return <span className="text-sm font-semibold text-slate-900">{c}</span>;
  return c ? <Check /> : <Cross />;
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

/** Free vs Pro feature matrix — the value story for the pricing page. */
export function PlanComparisonTable() {
  return (
    <div className="glass overflow-hidden rounded-3xl shadow-card">
        {/* Column headers */}
        <div className="grid grid-cols-[1.4fr_1fr_1fr] items-end gap-2 border-b border-slate-200 px-5 py-4 sm:px-6">
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">Features</span>
          <span className="text-center text-sm font-semibold text-slate-600">Free</span>
          <span className="text-center text-sm font-bold">
            <span className="rounded-full bg-accent-gradient px-3 py-1 text-white shadow-glow-soft">Pro</span>
          </span>
        </div>

        {ROWS.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1.4fr_1fr_1fr] items-center gap-2 border-b border-slate-200 px-5 py-3.5 last:border-0 sm:px-6"
          >
            <span className="text-sm text-slate-600">{row.label}</span>
            <span className="text-center">{renderCell(row.free)}</span>
            <span className="text-center">{renderCell(row.pro)}</span>
          </div>
        ))}
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
