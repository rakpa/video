import { useCallback, useState } from 'react';
import { navigate } from '../hooks/useRoute';
import { clearLicense, getLicense, type StoredLicense } from '../lib/license';
import { useStripeReturn } from '../hooks/useStripeReturn';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import { RestoreProPanel } from '../components/RestoreProPanel';
import { Confetti } from '../components/Confetti';
import { SiteHeader } from '../components/SiteHeader';
import { Button } from '../components/Button';
import { PlanComparisonTable, PricingHero } from '../components/PlanComparison';
import { Faq } from '../components/Faq';
import { Footer } from '../components/Footer';
import { COMPANY } from '../config/company';
import { planAccessLabel, planLabel } from '../lib/plan';
import type { Theme } from '../hooks/useTheme';

const PRICING_FAQ = [
  {
    q: 'What’s the difference between Free and Pro?',
    a: 'Free downloads go up to 1080p Full HD with sound. Pro ($19.99/year) unlocks 2K & 4K, plus MP3 extraction and priority processing.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Yearly Pro renews once a year and you can cancel anytime — you keep access until the end of your billing period.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'We offer a 14-day money-back guarantee on your initial purchase if the service doesn’t work as described. See our Refund Policy for details.',
  },
  {
    q: 'Which payment methods do you accept?',
    a: 'All major cards — Visa, Mastercard, and American Express — processed securely by Stripe. We never see or store your card details.',
  },
  {
    q: 'I signed out or switched phones — how do I get Pro back?',
    a: 'Go to Pricing and use “Restore Pro access”. Enter the same email you used at Stripe checkout — we’ll verify your purchase and unlock Pro on this device again.',
  },
  {
    q: 'Is my payment secure?',
    a: `Yes. All payments are handled by Stripe over 256-bit SSL encryption. ${COMPANY.brand} never touches your full card number.`,
  },
];

interface Props {
  theme: Theme;
  onToggleTheme: () => void;
}

/** Pricing + Stripe checkout page. Also handles the post-checkout redeem flow. */
export function PricingPage({ theme, onToggleTheme }: Props) {
  useDocumentMeta({
    title: `Pricing — Free & Pro Plans · ${COMPANY.brand}`,
    description:
      'VidCliply is free for downloads up to 1080p with sound. Go Pro ($19.99/year) for 2K & 4K, MP3 audio, and priority processing. Cancel anytime.',
  });
  const [license, setLic] = useState<StoredLicense | null>(getLicense());
  const [justUpgraded, setJustUpgraded] = useState(false);

  useStripeReturn(useCallback((lic) => {
    setLic(lic);
    setJustUpgraded(true);
  }, []));

  return (
    <div className="app-bg min-h-screen text-slate-600">
      <SiteHeader theme={theme} onToggleTheme={onToggleTheme} maxWidth="max-w-6xl" />

      <main className="mx-auto max-w-6xl px-5 pb-20">
        {license ? (
          <ProStatus license={license} justUpgraded={justUpgraded} onSignOut={() => { clearLicense(); setLic(null); }} />
        ) : (
          <>
            <PricingHero />
            <div className="mt-10 space-y-10">
              <PlanComparisonTable />
              <RestoreProPanel onRestored={(lic) => setLic(lic)} />
            </div>
            <Faq items={PRICING_FAQ} />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function ProStatus({
  license,
  justUpgraded,
  onSignOut,
}: {
  license: StoredLicense;
  justUpgraded: boolean;
  onSignOut: () => void;
}) {
  return (
    <div className="glass relative mt-6 overflow-hidden rounded-3xl p-8 text-center shadow-card">
      {justUpgraded && <Confetti />}
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-accent-gradient shadow-glow">
        <svg viewBox="0 0 24 24" className="h-8 w-8 text-white" fill="currentColor" aria-hidden="true">
          <path d="m12 2 2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6L12 2Z" />
        </svg>
      </div>
      <h1 className="mt-5 text-2xl font-bold text-slate-900">{justUpgraded ? 'Welcome to Pro! 🎉' : 'You’re on Pro'}</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm text-slate-600">
        2K and 4K downloads are unlocked for <span className="font-medium text-slate-900">{license.email}</span>.
        Plan: <span className="capitalize">{planLabel(license.plan)}</span>
        {' · '}
        {planAccessLabel(license.plan, license.expiresAt)}.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Button onClick={() => navigate('/')}>Start downloading</Button>
        <Button variant="ghost" onClick={onSignOut}>Sign out of Pro</Button>
      </div>

      <p className="mx-auto mt-4 max-w-sm text-xs text-slate-400">
        Signing out only removes Pro on this device. To use Pro again here, go to Pricing and tap{' '}
        <span className="font-medium text-slate-500">Restore Pro access</span> with your checkout email.
      </p>

      <p className="mt-5 text-xs text-slate-400">
        {['pro', 'hd', '2k', '4k', 'yearly', 'monthly'].includes(license.plan)
          ? 'Need to update billing or cancel? '
          : 'Questions about your purchase? '}
        <a href={`mailto:${COMPANY.contactEmail}`} className="font-medium text-indigo-600 transition hover:text-indigo-700 hover:underline">
          Contact {COMPANY.contactEmail}
        </a>
      </p>
    </div>
  );
}
