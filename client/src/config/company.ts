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
  /** Legal entity that operates the free downloader tool. */
  toolEntity: '[Your Company Ltd.]',
  /**
   * Separate entity that sells the paid subscription / processes payments.
   * Keeping billing under a distinct entity is the common way these services
   * insulate the free tool from payment-processor and platform risk.
   */
  billingEntity: '[Your Billing Co. Ltd.]',
  /** Jurisdiction whose laws govern the Terms. */
  jurisdiction: '[Country / State]',
  /** General contact + DMCA agent email. */
  contactEmail: 'support@vidcliply.com',
  dmcaEmail: 'dmca@vidcliply.com',
  /** Registered mailing address for legal notices. */
  address: '[Registered business address]',
  /** Shown as the "last updated" date on every legal page. */
  lastUpdated: 'June 15, 2026',
} as const;
