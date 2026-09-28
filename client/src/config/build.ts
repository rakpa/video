/**
 * Build-time feature flags.
 *
 * HIDE_PRO — when the app is built with `VITE_HIDE_PRO=1`, every paid "Pro"
 * surface (upgrade cards, pricing page/links, "Go Pro" buttons, quality locks
 * above the free tier) is removed. This is used for the **iOS App Store build**:
 * Apple Guideline 3.1.1 forbids selling digital upgrades through Stripe, so v1
 * ships free-tier only (downloads up to 1080p). The web build leaves the flag
 * unset, so vidcliply.com keeps its full Stripe Pro flow unchanged.
 */
export const HIDE_PRO = import.meta.env.VITE_HIDE_PRO === '1';
