# VidCliply iOS — In-App Purchase (StoreKit) migration plan

**Why:** Apple Guideline **3.1.1** requires that unlocking digital features inside
an iOS app use **In-App Purchase**. The web app's "Pro" upgrade (2K/4K/MP3,
unlimited) is sold through **Stripe** — that flow will be **rejected** if it's
reachable in the iOS build. This document is the plan; implementation happens on
the Mac in a later version.

---

## Recommended path: ship v1.0 free-tier only — ✅ IMPLEMENTED

Fastest route to a first approval. The paid upgrade is hidden in the iOS build via
a single build-time flag; web behaviour is unchanged. Add real IAP in v1.1.

**How it works** (already wired up):
- Flag module: `client/src/config/build.ts` → `export const HIDE_PRO = import.meta.env.VITE_HIDE_PRO === '1'`.
- Build the iOS bundle with the flag set:
  `VITE_HIDE_PRO=1 VITE_API_URL=https://clipvault-api-production.up.railway.app npm run build`.
- Surfaces gated on `HIDE_PRO`:
  - `client/src/App.tsx` — `/pricing` route redirects home; `showProUpgrade` forced false.
  - `client/src/components/QualitySelector.tsx` — formats above the free tier are
    filtered out (only 720p/1080p show; no PRO locks; download button never says "Go Pro").
  - `client/src/components/SiteHeader.tsx` — "Go Pro" button, Pro "Account" button,
    and "Pricing" nav link removed.
  - `client/src/components/Footer.tsx` — "Pricing" footer link removed.
- Result: a clean free app (up to 1080p) with **no Stripe / external-payment path**.
  Verified in preview — quality panel shows only 720p/1080p with a normal Download button.

---

## v1.1 path: real StoreKit IAP

If you want to sell Pro on iOS, use IAP via the community plugin.

### Product design
- **Type:** Auto-Renewing Subscription (matches the current `$9.99/year`), or a
  Non-Consumable one-time unlock if you prefer.
- **App Store Connect → Features → In-App Purchases / Subscriptions:**
  - Reference name: `VidCliply Pro (Yearly)`
  - Product ID: `com.vidcliply.app.pro.yearly`
  - Price tier: $9.99/yr (or your choice).

### Implementation sketch
```bash
# from client/
npm install @revenuecat/purchases-capacitor   # or cordova-plugin-purchase
npx cap sync ios
```
- On "Go Pro" tap in the iOS build, call the plugin's `purchase()` instead of the
  Stripe checkout (`useStripeReturn` / Stripe redirect in `client/src/App.tsx`).
- On success, set the same local entitlement the app already reads
  (`client/src/lib/license.ts` → `isPro()` / `maxAllowedHeight()` / `licenseToken()`),
  so the rest of the UI (quality caps, badges) works unchanged.
- Add a **Restore Purchases** button (Apple requires it) that calls the plugin's
  `restorePurchases()`.

### Server side
- Your Render API already caps quality by license token. Add validation of the
  Apple receipt / RevenueCat webhook so the server trusts iOS entitlements the same
  way it trusts Stripe ones. Keep Stripe for the web; add IAP as a parallel source.

### Keep the two worlds separate
- **Web (vidcliply.com):** Stripe — unchanged.
- **iOS app:** IAP only. Never show Stripe links/prices in the app (Guideline 3.1.1
  also forbids *linking out* to external purchase from most app categories).

---

## Checklist before submitting a build that contains IAP
- [ ] Products created & "Ready to Submit" in App Store Connect.
- [ ] Products attached to the app version being submitted.
- [ ] Restore Purchases button present.
- [ ] No Stripe / external-payment UI reachable anywhere in the iOS build.
- [ ] Paid Agreements active (Agreements, Tax, and Banking in App Store Connect —
      *your account/banking details; I can't complete this*).
