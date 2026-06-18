import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ApiError, createCheckout, fetchBillingConfig, type BillingConfig } from '../api/client';
import { navigate } from '../hooks/useRoute';
import { PaymentBadges } from './PaymentBadges';
import { Confetti } from './Confetti';

type PlanId = 'monthly' | 'lifetime';

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

interface Props {
  /** Contextual quality label, e.g. "1440p". */
  selectedQuality?: string;
  /** Compact layout for embedding below the quality picker. */
  inline?: boolean;
}

/** Pro checkout panel — embeddable inline or on the standalone pricing page. */
export function ProUpgradePanel({ selectedQuality, inline = false }: Props) {
  const [cfg, setCfg] = useState<BillingConfig | null>(null);
  const [plan, setPlan] = useState<PlanId>('monthly');
  const [agree, setAgree] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBillingConfig().then(setCfg).catch(() => setError('Could not load pricing.'));
  }, []);

  const startCheckout = async () => {
    setError(null);
    setBusy(true);
    try {
      const url = await createCheckout(plan);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start checkout.');
      setBusy(false);
    }
  };

  const selectedCents = cfg ? cfg.plans[plan].cents : plan === 'monthly' ? 599 : 900;

  return (
    <motion.div
      initial={inline ? { opacity: 0, y: 12 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={inline ? '' : 'mt-8'}
    >
      <div className={inline ? '' : 'text-center'}>
        <h2 className={`font-extrabold tracking-tight text-slate-900 ${inline ? 'text-xl sm:text-2xl' : 'text-3xl sm:text-4xl'}`}>
          Unlock <span className="gradient-text">HD, 2K &amp; 4K</span>
        </h2>
        <p className={`mt-2 text-slate-600 ${inline ? 'text-sm' : 'mx-auto mt-3 max-w-md'}`}>
          {selectedQuality
            ? `${selectedQuality} requires Pro. Free downloads go up to 1080p.`
            : 'Free downloads go up to 1080p. Go Pro to grab full-quality video with sound — up to 4K.'}
        </p>
      </div>

      <div className={`glass rounded-3xl p-5 shadow-card sm:p-6 ${inline ? 'mt-4' : 'mx-auto mt-8'}`}>
        <div className="grid grid-cols-2 gap-3">
          <PlanCard
            active={plan === 'monthly'}
            onClick={() => setPlan('monthly')}
            title="Monthly"
            price={money(cfg?.plans.monthly.cents ?? 599)}
            suffix="/mo"
            note="Cancel anytime"
          />
          <PlanCard
            active={plan === 'lifetime'}
            onClick={() => setPlan('lifetime')}
            title="Lifetime"
            price={money(cfg?.plans.lifetime.cents ?? 900)}
            suffix="once"
            note="Pay once, yours forever"
            badge="Best value"
          />
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-center text-sm text-rose-700">{error}</p>
        )}
        {cfg && !cfg.enabled && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-700">
            Payments aren’t configured yet. Add your Stripe keys to <code>server/.env</code> to enable checkout.
          </p>
        )}

        <motion.button
          type="button"
          onClick={startCheckout}
          disabled={busy || !agree || (cfg ? !cfg.enabled : false)}
          whileHover={{ scale: busy ? 1 : 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="btn-gradient mt-5 flex w-full items-center justify-center gap-2 rounded-2xl px-8 py-4 text-lg font-semibold text-white shadow-glow-soft transition-shadow hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Redirecting…
            </>
          ) : (
            <>Subscribe now for {money(selectedCents)}</>
          )}
        </motion.button>

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
            <button type="button" onClick={() => navigate('/terms')} className="text-indigo-600 hover:underline">
              Terms of Service
            </button>{' '}
            and{' '}
            <button type="button" onClick={() => navigate('/refunds')} className="text-indigo-600 hover:underline">
              Refund Policy
            </button>
            . Prices exclude VAT where applicable.
          </span>
        </label>
      </div>

      <FeatureList compact={inline} />
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
        {selectedQuality ? `${selectedQuality} and all Pro qualities` : 'HD, 2K and 4K'} are unlocked.
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

function PlanCard({
  active,
  onClick,
  title,
  price,
  suffix,
  note,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  price: string;
  suffix: string;
  note: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all',
        active
          ? 'border-accent/60 bg-indigo-50 shadow-glow'
          : 'border-slate-200 bg-white hover:bg-slate-50',
      ].join(' ')}
    >
      {badge && (
        <span className="absolute -top-2 right-3 rounded-full bg-accent-gradient px-2 py-0.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
      <span className="text-sm font-medium text-slate-600">{title}</span>
      <span className="mt-1 text-2xl font-extrabold text-slate-900">
        {price}
        <span className="ml-1 text-sm font-medium text-slate-400">{suffix}</span>
      </span>
      <span className="mt-1 text-xs text-slate-400">{note}</span>
    </button>
  );
}

function FeatureList({ compact }: { compact?: boolean }) {
  const features = [
    '1080p, 2K and 4K downloads',
    'Always merged MP4 with sound',
    'MP3 audio extraction',
    'No download limits',
  ];
  return (
    <ul className={`space-y-2 ${compact ? 'mt-5' : 'mx-auto mt-8 max-w-sm'}`}>
      {features.map((f) => (
        <li key={f} className="flex items-center gap-2.5 text-sm text-slate-600">
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-500">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
            </svg>
          </span>
          {f}
        </li>
      ))}
    </ul>
  );
}
