import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { COMPANY } from '../config/company';
import { navigate } from '../hooks/useRoute';
import { SiteHeader } from '../components/SiteHeader';
import { Button } from '../components/Button';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import type { Theme } from '../hooks/useTheme';

/* ----------------------------------------------------------------------------
 * NOTE: These documents are TEMPLATES tailored to a video-downloader product.
 * They are not legal advice. Replace the bracketed placeholders in
 * `config/company.ts` and have a qualified lawyer review them before launch.
 * ------------------------------------------------------------------------- */

/** All legal routes, used by the router and the footer. */
export const LEGAL_ROUTES: Record<string, { title: string; render: () => ReactNode }> = {
  '/terms': { title: 'Terms of Service', render: TermsOfService },
  '/privacy': { title: 'Privacy Policy', render: PrivacyPolicy },
  '/dmca': { title: 'DMCA / Copyright Policy', render: DmcaPolicy },
  '/refunds': { title: 'Refund & Subscription Policy', render: RefundPolicy },
};

export const LEGAL_LINKS = [
  { path: '/terms', label: 'Terms of Service' },
  { path: '/privacy', label: 'Privacy Policy' },
  { path: '/dmca', label: 'DMCA' },
  { path: '/refunds', label: 'Refunds' },
];

interface Props {
  path: string;
  theme: Theme;
  onToggleTheme: () => void;
}

/** Full-page legal document shell with header, prose, and footer nav. */
export function LegalPage({ path, theme, onToggleTheme }: Props) {
  const route = LEGAL_ROUTES[path];
  useDocumentMeta({
    title: route?.title ?? 'Not found',
    description: route
      ? `${route.title} for ${COMPANY.brand} — ${COMPANY.domain}. Last updated ${COMPANY.lastUpdated}.`
      : '',
  });
  if (!route) return <NotFound />;

  return (
    <div className="app-bg min-h-screen text-slate-600">
      <SiteHeader theme={theme} onToggleTheme={onToggleTheme} maxWidth="max-w-5xl" />

      <main className="mx-auto max-w-3xl px-5 pb-20">
        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="glass rounded-3xl p-6 shadow-card sm:p-10"
        >
          <button
            onClick={() => navigate('/')}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-indigo-600 transition hover:text-indigo-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
            </svg>
            Back to app
          </button>

          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{route.title}</h1>
          <p className="mt-3 text-sm text-slate-400">Last updated: {COMPANY.lastUpdated}</p>

          <div className="mt-10 space-y-6 border-t border-slate-100 pt-8 text-[16px] leading-relaxed text-slate-600">{route.render()}</div>
        </motion.article>

        {/* Cross-links between legal docs */}
        <nav className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-500">
          {LEGAL_LINKS.map((l) => (
            <LegalLink key={l.path} to={l.path} active={l.path === path}>
              {l.label}
            </LegalLink>
          ))}
        </nav>
      </main>
    </div>
  );
}

/* ------------------------------- primitives ------------------------------- */

function H2({ children }: { children: ReactNode }) {
  return <h2 className="pt-2 text-xl font-bold text-slate-900">{children}</h2>;
}
function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}
function UL({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2 marker:text-indigo-500">{children}</ul>;
}
function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>;
}
function LegalLink({ to, active, children }: { to: string; active?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={() => navigate(to)}
      className={active ? 'font-medium text-indigo-600' : 'transition hover:text-slate-900'}
    >
      {children}
    </button>
  );
}

function NotFound() {
  return (
    <div className="app-bg grid min-h-screen place-items-center px-5 text-center text-slate-600">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
        <Button onClick={() => navigate('/')} className="mt-5">
          Back to {COMPANY.brand}
        </Button>
      </div>
    </div>
  );
}

/* =============================== DOCUMENTS =============================== */

function TermsOfService() {
  return (
    <>
      <P>
        These Terms of Service (“Terms”) govern your access to and use of the {COMPANY.brand} website and tools at{' '}
        {COMPANY.domain} (the “Service”), operated by {COMPANY.toolEntity} (“we”, “us”, “our”). By using the Service you
        agree to these Terms. If you do not agree, do not use the Service.
      </P>

      <H2>1. The Service</H2>
      <P>
        {COMPANY.brand} is a technical tool that allows a user to retrieve a media file from a URL the user provides. The
        Service does not host, store, or index any third-party media. It acts only at your direction, on content you
        choose to access.
      </P>

      <H2>2. No affiliation</H2>
      <P>
        <Strong>
          {COMPANY.brand} is an independent service and is not affiliated with, sponsored by, endorsed by, or associated
          with YouTube, Google, Meta, Facebook, Instagram, or any other platform or trademark holder.
        </Strong>{' '}
        All product names, logos, and brands are the property of their respective owners and are used for identification
        only.
      </P>

      <H2>3. Your responsibility for content rights</H2>
      <P>
        You are solely responsible for the content you choose to download and for ensuring you have the legal right to do
        so. You agree to use the Service only for content that:
      </P>
      <UL>
        <li>you own or created yourself; or</li>
        <li>you have explicit permission from the rights holder to download; or</li>
        <li>is in the public domain or available under a licence that permits downloading.</li>
      </UL>
      <P>
        You must comply with the terms of service of the source platform and with all applicable copyright and other
        laws in your jurisdiction. <Strong>Downloading copyrighted material without authorisation is prohibited</Strong>{' '}
        and is your responsibility, not ours.
      </P>

      <H2>4. Acceptable use</H2>
      <P>You agree not to:</P>
      <UL>
        <li>use the Service for any unlawful purpose or to infringe any third party’s rights;</li>
        <li>resell, redistribute, or commercially exploit downloaded content you do not own;</li>
        <li>use bots, scrapers, or automated systems to overload or abuse the Service;</li>
        <li>circumvent rate limits, access controls, or security measures.</li>
      </UL>

      <H2>5. Paid features</H2>
      <P>
        Certain features (such as high-definition or audio-only downloads) may require a paid subscription, which is
        provided and billed by {COMPANY.billingEntity} under the separate{' '}
        <LegalLink to="/refunds">Refund &amp; Subscription Policy</LegalLink>. That policy forms part of these Terms for
        paying users.
      </P>

      <H2>6. Disclaimer of warranties</H2>
      <P>
        <Strong>The Service is provided “as is” and “as available”, without warranties of any kind</Strong>, express or
        implied, including merchantability, fitness for a particular purpose, availability, or non-infringement. We do
        not warrant that the Service will be uninterrupted, error-free, or that any particular download will succeed.
      </P>

      <H2>7. Limitation of liability</H2>
      <P>
        To the maximum extent permitted by law, {COMPANY.toolEntity} and its officers, employees, and partners shall not
        be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data,
        revenue, or profits, arising from your use of or inability to use the Service, or from your use of any content
        obtained through it. Our total aggregate liability shall not exceed the amount you paid us (if any) in the three
        months preceding the claim.
      </P>

      <H2>8. Indemnification</H2>
      <P>
        You agree to indemnify and hold harmless {COMPANY.toolEntity} from any claims, damages, or expenses (including
        reasonable legal fees) arising from your use of the Service or your violation of these Terms or any third-party
        right.
      </P>

      <H2>9. Termination</H2>
      <P>
        We may suspend or terminate your access at any time, without notice, for conduct that we believe violates these
        Terms or harms other users, us, or third parties.
      </P>

      <H2>10. Changes</H2>
      <P>
        We may update these Terms from time to time. Continued use of the Service after changes become effective
        constitutes acceptance of the revised Terms.
      </P>

      <H2>11. Governing law</H2>
      <P>
        These Terms are governed by the laws of {COMPANY.jurisdiction}, without regard to conflict-of-law rules. Disputes
        shall be subject to the exclusive jurisdiction of the courts located there.
      </P>

      <H2>12. Contact</H2>
      <P>
        Questions about these Terms: <Strong>{COMPANY.contactEmail}</Strong> — {COMPANY.address}.
      </P>
    </>
  );
}

function PrivacyPolicy() {
  return (
    <>
      <P>
        This Privacy Policy explains how {COMPANY.toolEntity} (“we”) handles information when you use {COMPANY.brand} at{' '}
        {COMPANY.domain}. We aim to collect as little personal data as possible.
      </P>

      <H2>1. Information we collect</H2>
      <UL>
        <li>
          <Strong>URLs you submit</Strong> — processed transiently to fetch the media you request. We do not build a
          profile of your downloads.
        </li>
        <li>
          <Strong>Technical data</Strong> — IP address, browser type, device, and timestamps, used for security, abuse
          prevention, and rate limiting.
        </li>
        <li>
          <Strong>Account &amp; billing data</Strong> (only if you subscribe) — email and payment details, handled by our
          payment processor; we do not store full card numbers.
        </li>
        <li>
          <Strong>Cookies &amp; analytics</Strong> — to remember preferences (e.g. theme) and understand aggregate usage.
        </li>
      </UL>

      <H2>2. Downloaded files are not stored</H2>
      <P>
        Media files are processed on our servers only for the moment needed to deliver your download, streamed to your
        device, and then <Strong>automatically deleted</Strong>. We do not retain copies of downloaded content.
      </P>

      <H2>3. How we use information</H2>
      <UL>
        <li>to operate, maintain, and secure the Service;</li>
        <li>to process subscriptions and provide support;</li>
        <li>to prevent fraud, abuse, and excessive automated use;</li>
        <li>to comply with legal obligations.</li>
      </UL>

      <H2>4. Sharing</H2>
      <P>
        We do not sell your personal data. We share data only with service providers (hosting, analytics, payment
        processing) under contract, or when required by law or valid legal process.
      </P>

      <H2>5. Advertising</H2>
      <P>
        Free use of the Service may be supported by third-party advertising partners, who may use cookies to serve
        relevant ads. Their use of data is governed by their own privacy policies.
      </P>

      <H2>6. Your rights</H2>
      <P>
        Depending on your location (e.g. GDPR/CCPA), you may have the right to access, correct, delete, or port your
        data, or object to its processing. To exercise these rights, contact {COMPANY.contactEmail}.
      </P>

      <H2>7. Data retention &amp; security</H2>
      <P>
        We keep account and billing records as long as needed to provide the Service and meet legal obligations, and
        apply reasonable technical and organisational measures to protect data. No method of transmission is 100% secure.
      </P>

      <H2>8. Children</H2>
      <P>The Service is not directed to children under 13 (or the minimum age in your jurisdiction).</P>

      <H2>9. Contact</H2>
      <P>
        Privacy questions: <Strong>{COMPANY.contactEmail}</Strong> — {COMPANY.address}.
      </P>
    </>
  );
}

function DmcaPolicy() {
  return (
    <>
      <P>
        {COMPANY.toolEntity} respects the intellectual-property rights of others and complies with the Digital Millennium
        Copyright Act (DMCA) and equivalent laws. {COMPANY.brand} does not host or store user content; it is a tool that
        acts at a user’s direction. Nonetheless, we provide this notice-and-takedown process.
      </P>

      <H2>1. Filing a copyright notice</H2>
      <P>
        If you believe the Service has been used to infringe your copyright, send a written notice to our designated
        agent at <Strong>{COMPANY.dmcaEmail}</Strong> including:
      </P>
      <UL>
        <li>your physical or electronic signature;</li>
        <li>identification of the copyrighted work claimed to be infringed;</li>
        <li>the specific material and information reasonably sufficient to locate it;</li>
        <li>your contact information (address, telephone, email);</li>
        <li>
          a statement that you have a good-faith belief the use is not authorised by the owner, its agent, or the law;
        </li>
        <li>
          a statement, under penalty of perjury, that the information is accurate and that you are the owner or
          authorised to act on the owner’s behalf.
        </li>
      </UL>

      <H2>2. Counter-notification</H2>
      <P>
        If you believe material was removed in error, you may submit a counter-notice to {COMPANY.dmcaEmail} containing
        your signature, identification of the material, a statement under penalty of perjury that the removal was a
        mistake or misidentification, and your consent to jurisdiction as required by the DMCA.
      </P>

      <H2>3. Repeat infringers</H2>
      <P>
        We will, in appropriate circumstances, restrict or terminate access for users who are determined to be repeat
        infringers.
      </P>

      <H2>4. Designated agent</H2>
      <P>
        DMCA notices should be directed to: <Strong>Copyright Agent</Strong>, {COMPANY.toolEntity}, {COMPANY.address} —{' '}
        {COMPANY.dmcaEmail}.
      </P>
    </>
  );
}

function RefundPolicy() {
  return (
    <>
      <P>
        Paid subscriptions to {COMPANY.brand} (for example, HD video and MP3 audio downloads) are sold and processed by{' '}
        {COMPANY.billingEntity} (“Billing Provider”). This policy describes subscription, renewal, cancellation, and
        refund terms.
      </P>

      <H2>1. Subscription plans</H2>
      <P>
        Plans are offered on recurring billing cycles (e.g. 1, 6, or 12 months) at the prices shown at checkout. Prices
        may exclude applicable taxes/VAT, which are added where required.
      </P>

      <H2>2. Automatic renewal</H2>
      <P>
        <Strong>Subscriptions renew automatically</Strong> at the end of each cycle at the then-current price, using your
        saved payment method, unless you cancel before the renewal date. We will rely on the authorisation you provide at
        purchase to charge each renewal.
      </P>

      <H2>3. Cancellation</H2>
      <P>
        You may cancel at any time from your account page or by emailing {COMPANY.contactEmail}. Cancellation stops
        future renewals; you retain access until the end of the current paid period. Cancelling does not, by itself,
        trigger a refund of the current period.
      </P>

      <H2>4. Refunds</H2>
      <UL>
        <li>
          <Strong>14-day guarantee:</Strong> if the Service does not work as described, you may request a refund within 14
          days of your initial purchase.
        </li>
        <li>
          Refunds are generally not provided for partially used billing periods or for renewals you forgot to cancel,
          except where required by law.
        </li>
        <li>
          Statutory rights (for example, EU/UK consumer “cooling-off” rights) are not affected by this policy and prevail
          where applicable.
        </li>
      </UL>

      <H2>5. How to request a refund</H2>
      <P>
        Email {COMPANY.contactEmail} from your account email with your order details. Approved refunds are returned to the
        original payment method within a reasonable period set by the Billing Provider and your bank.
      </P>

      <H2>6. Chargebacks</H2>
      <P>
        Please contact us before initiating a chargeback so we can resolve the issue. Fraudulent chargebacks may result
        in termination of access.
      </P>

      <H2>7. Billing contact</H2>
      <P>
        Billing and refund enquiries: <Strong>{COMPANY.contactEmail}</Strong>. The merchant of record for paid
        subscriptions is {COMPANY.billingEntity}.
      </P>
    </>
  );
}
