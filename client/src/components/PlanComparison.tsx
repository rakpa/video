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
    <svg viewBox="0 0 24 24" className="mx-auto h-5 w-5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}
function Cross() {
  return (
    <svg viewBox="0 0 24 24" className="mx-auto h-4 w-4 text-white/25" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function renderCell(c: Cell) {
  if (typeof c === 'string') return <span className="text-sm font-semibold text-white">{c}</span>;
  return c ? <Check /> : <Cross />;
}

/** Free vs Pro feature matrix — the value story for the pricing page. */
export function PlanComparison() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto mt-6 max-w-2xl"
    >
      <h1 className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">
        Simple pricing, <span className="gradient-text">serious quality</span>
      </h1>
      <p className="mx-auto mt-3 max-w-md text-center text-white/60">
        Start free at 1080p. Upgrade once you need 2K, 4K, or MP3 — cancel anytime.
      </p>

      <div className="glass mt-10 overflow-hidden rounded-3xl shadow-card">
        {/* Column headers */}
        <div className="grid grid-cols-[1.4fr_1fr_1fr] items-end gap-2 border-b border-white/10 px-5 py-4 sm:px-6">
          <span className="text-xs font-medium uppercase tracking-wider text-white/40">Features</span>
          <span className="text-center text-sm font-semibold text-white/70">Free</span>
          <span className="text-center text-sm font-bold">
            <span className="rounded-full bg-accent-gradient px-3 py-1 text-white shadow-glow-soft">Pro</span>
          </span>
        </div>

        {ROWS.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[1.4fr_1fr_1fr] items-center gap-2 border-b border-white/[0.06] px-5 py-3.5 last:border-0 sm:px-6"
          >
            <span className="text-sm text-white/75">{row.label}</span>
            <span className="text-center">{renderCell(row.free)}</span>
            <span className="text-center">{renderCell(row.pro)}</span>
          </div>
        ))}
      </div>
    </motion.section>
  );
}
