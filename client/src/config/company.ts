/**
 * Single place to edit your legal/business identity. Replace the placeholders
 * with your real registered details before going live. Keeping them here means
 * every legal page updates at once.
 */
export const COMPANY = {
  /** Public product/brand name. */
  brand: 'ClipVault',
  /** Website domain (no protocol). */
  domain: 'clipvault.example',
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
  contactEmail: 'support@clipvault.example',
  dmcaEmail: 'dmca@clipvault.example',
  /** Registered mailing address for legal notices. */
  address: '[Registered business address]',
  /** Shown as the "last updated" date on every legal page. */
  lastUpdated: 'June 15, 2026',
} as const;
