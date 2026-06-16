import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { clearLicense, getLicense, type StoredLicense } from '../lib/license';
import { useStripeReturn } from '../hooks/useStripeReturn';
import { ProUpgradePanel } from '../components/ProUpgradePanel';
import { Confetti } from '../components/Confetti';
import { PlanComparison } from '../components/PlanComparison';
import { StitchShell } from '../components/StitchShell';
import { COMPANY } from '../config/company';

const PRICING_FAQ = [
  {
    q: 'What’s the difference between Free and Pro?',
    a: 'Free downloads go up to 1080p with sound. Pro unlocks 2K and 4K, MP3 audio extraction, unlimited downloads, and priority processing.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Monthly plans can be cancelled at any time from your account — you keep access until the end of the period.',
  },
  {
    q: 'Do you offer refunds?',
    a: 'We offer a 14-day money-back guarantee on your initial purchase if the service doesn’t work as described.',
  },
  {
    q: 'Which payment methods do you accept?',
    a: 'Visa, Mastercard, American Express, and PayPal — all processed securely by Stripe.',
  },
];

export function PricingPage() {
  const [license, setLic] = useState<StoredLicense | null>(getLicense());
  const [justUpgraded, setJustUpgraded] = useState(false);

  useStripeReturn(
    useCallback((lic) => {
      setLic(lic);
      setJustUpgraded(true);
    }, []),
  );

  return (
    <StitchShell>
      <div className="max-w-container-max mx-auto px-margin-mobile md:px-margin-desktop py-stack-xl">
        <div className="text-center mb-12">
          <h1 className="font-display-lg text-display-lg text-on-background mb-4">Simple, transparent pricing</h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl mx-auto">
            Start free with 1080p downloads. Upgrade to Pro for 4K, unlimited saves, and priority processing.
          </p>
        </div>

        {license ? (
          <ProStatus license={license} justUpgraded={justUpgraded} onSignOut={() => { clearLicense(); setLic(null); }} />
        ) : (
          <>
            <div className="glass-panel rounded-xl p-6 border border-outline-variant/20">
              <PlanComparison />
            </div>
            <div className="mx-auto mt-12 max-w-xl">
              <ProUpgradePanel />
            </div>
            <section className="mt-16 max-w-2xl mx-auto">
              <h2 className="font-headline-md text-headline-md text-on-surface text-center mb-8">Pricing FAQ</h2>
              <div className="space-y-4">
                {PRICING_FAQ.map((item) => (
                  <details key={item.q} className="glass-panel rounded-lg p-4 border border-outline-variant/20 group">
                    <summary className="font-label-md text-label-md text-on-surface cursor-pointer list-none flex justify-between items-center">
                      {item.q}
                      <span className="material-symbols-outlined text-outline group-open:rotate-180 transition-transform">expand_more</span>
                    </summary>
                    <p className="mt-3 font-body-md text-body-md text-on-surface-variant">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </StitchShell>
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
    <div className="glass-panel relative max-w-xl mx-auto overflow-hidden rounded-xl p-8 text-center border border-outline-variant/20">
      {justUpgraded && <Confetti />}
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary shadow-sm">
        <span className="material-symbols-outlined text-on-primary text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
          workspace_premium
        </span>
      </div>
      <h1 className="mt-5 font-headline-md text-headline-md text-on-surface">
        {justUpgraded ? 'Welcome to Pro!' : 'You’re on Pro'}
      </h1>
      <p className="mx-auto mt-2 max-w-sm font-body-md text-body-md text-on-surface-variant">
        HD, 2K and 4K downloads are unlocked for <span className="font-medium text-on-surface">{license.email}</span>.
        Plan: <span className="capitalize">{license.plan}</span>
        {license.expiresAt ? ` · renews ${new Date(license.expiresAt).toLocaleDateString()}` : ' · lifetime access'}.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link
          to="/"
          className="h-12 px-8 bg-primary text-on-primary rounded-lg font-label-md text-label-md inline-flex items-center justify-center no-underline hover:shadow-md transition-all"
        >
          Start downloading
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="h-12 px-8 bg-surface-container-high text-on-surface rounded-lg font-label-md text-label-md hover:bg-surface-variant transition-all"
        >
          Sign out of Pro
        </button>
      </div>
      <p className="mt-5 font-label-sm text-label-sm text-outline">
        Questions?{' '}
        <a href={`mailto:${COMPANY.contactEmail}`} className="font-medium text-primary hover:underline">
          {COMPANY.contactEmail}
        </a>
      </p>
    </div>
  );
}
