/**
 * Single place to edit your legal/business identity. Keeping brand + domain here
 * means every page, logo, and legal doc updates at once.
 */
export const COMPANY = {
  /** Public product/brand name. */
  brand: 'VidCliply',
  /** Website domain (no protocol). */
  domain: 'vidcliply.com',
  /** Canonical production URL (no trailing slash). */
  siteUrl: 'https://vidcliply.com',
  /** Default browser / SEO page title suffix. */
  pageTitle: 'VidCliply — Free Video Downloader for YouTube, Facebook & Instagram',
  /** General contact + DMCA agent email. */
  contactEmail: 'support@vidcliply.com',
  // Same inbox as support — there is no separate DMCA mailbox.
  dmcaEmail: 'support@vidcliply.com',
  /** Shown as the "last updated" date on every legal page. */
  lastUpdated: 'October 2, 2026',
} as const;
