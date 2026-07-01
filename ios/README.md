# VidCliply — iOS App (Capacitor) build & publish runbook

This folder is the iOS delivery for VidCliply. The native shell wraps the existing
React/Vite web app (in `../client`) with **Capacitor** so the App Store build reuses
the *exact* current mobile design — layout, colours, typography, spacing, and
navigation — with the least possible risk of visual drift.

> **Why Capacitor, not a SwiftUI rebuild?** The UI is a complex React SPA
> (Framer Motion animations, Server-Sent-Events progress, Stripe, Web Share).
> Rebuilding it natively would take weeks and would *not* match the live design
> pixel-for-pixel. Capacitor renders the shipped web build inside a `WKWebView`
> and adds native status-bar / safe-area / gesture / splash handling. Maximum
> parity, minimum risk.

---

## ⚠️ Read first — what was done on Windows vs. what needs a Mac

This scaffold was prepared on Windows. **Everything below the line "MAC-ONLY" must be
done on a macOS machine with Xcode** — Apple's toolchain (Xcode, iOS Simulator,
CocoaPods, code signing, `xcodebuild`, App Store Connect upload) does not run on
Windows. There is no workaround; if you don't have a Mac, use a cloud Mac
(MacStadium, MacinCloud, or a GitHub Actions `macos-14` runner).

**Already done (in this repo):**
- Capacitor v6 added to `client/` (`@capacitor/core`, `ios`, `status-bar`,
  `splash-screen`, `app`, `browser`) + `capacitor.config.ts`.
- Safe-area / notch / Dynamic-Island handling via `env(safe-area-inset-*)` in
  `client/src/index.css`; `viewport-fit=cover` + iOS meta in `client/index.html`.
- Native bootstrap (`client/src/native/bootstrap.ts`) — status bar, splash hide,
  back-gesture — wired into `client/src/main.tsx`. All no-ops in the browser.
- App icon master + all sizes → `ios/appstore/icon/` (submit `AppIcon-1024.png`).
- `@capacitor/assets` sources → `client/assets/icon.png`, `splash.png`, `splash-dark.png`.
- App Store screenshots (raw + framed marketing) at 6.7"/6.5"/5.5" → `ios/appstore/`.
- Listing copy → `ios/APP-STORE-LISTING.md`; IAP plan → `ios/IAP-PLAN.md`.
- npm scripts in `client/package.json`: `ios:build`, `ios:sync`, `ios:open`, `ios:assets`.

---

## Two things that WILL block a working/approved build — fix these

### 1. Backend CORS must allow the Capacitor origin — ✅ DONE (2026-07-01)
The iOS app loads from `capacitor://localhost`. The API's `CLIENT_ORIGIN`
allowlist must include the Capacitor origins or calls from the app are **blocked
by CORS**. The API runs on **Railway** (`clipvault-api-production.up.railway.app`).
`CLIENT_ORIGIN` has been set to include:

```
CLIENT_ORIGIN=https://vidcliply.com,capacitor://localhost,http://localhost
```

Verified working — `capacitor://localhost` receives a matching
`access-control-allow-origin` header. (Keep your existing web origins.)

### 2. Payments must be Apple In-App Purchase, not Stripe — ✅ HANDLED for v1
Apple Guideline **3.1.1**: digital upgrades (your "Pro" 2K/4K/MP3) must use
StoreKit IAP, not Stripe, or the app is rejected. **v1 ships free-tier only:** the
`VITE_HIDE_PRO=1` build flag (`client/src/config/build.ts`) removes every paid
surface — "Go Pro" button, pricing page/links, Pro upgrade cards, and the 2K/4K
quality tiers (cards cap at 1080p, no PRO locks, no Stripe). The web build leaves
the flag unset, so vidcliply.com keeps full Pro/Stripe. Verified in preview:
quality panel shows only 720p/1080p and a normal Download button. To add real IAP
in a later version, see `ios/IAP-PLAN.md`.

### 3. App Review risk for a video downloader — reposition (Guideline 5.2.3)
Apps that download from YouTube/IG/FB are frequently rejected. The listing in
`APP-STORE-LISTING.md` is written to emphasise **downloading content you own or
have the rights to** (your own uploads, Creative Commons, licensed media). Keep
that framing in the app description, screenshots, and review notes.

---

# MAC-ONLY — build, run in Simulator, and submit

## 0. Prerequisites (on the Mac)
- macOS + **Xcode 15+** (from the Mac App Store), opened once to install components.
- **CocoaPods**: `sudo gem install cocoapods` (or `brew install cocoapods`).
- **Node 22** (matches `.nvmrc`).
- An **Apple Developer Program** membership ($99/yr) — *your credentials; I can't do this part.*

## 1. Get the code & install deps
```bash
git clone https://github.com/rakpa/video.git
cd video/client
npm install
```

## 2. Build the web app pointed at the production API
The app bundles its web assets and calls the remote API over HTTPS.
```bash
# from video/client
VITE_HIDE_PRO=1 VITE_API_URL=https://clipvault-api-production.up.railway.app npm run build
```

## 3. Generate the native iOS project
```bash
# from video/client
npx cap add ios          # creates client/ios/ (Xcode project + Pods)
npm run ios:assets       # generates AppIcon + splash from client/assets/*
npx cap sync ios         # copies web build + plugins into the iOS project
```

## 4. Run in the iOS Simulator (proof it works)
```bash
npm run ios:open         # opens client/ios/App/App.xcworkspace in Xcode
```
In Xcode: pick an **iPhone 15 Pro** simulator → **▶ Run**. Confirm the layout
matches the live mobile site, the status bar sits above the header, and the
home-indicator gap is correct at the bottom.

Or headless:
```bash
npx cap run ios
```

## 5. Xcode project configuration (before archiving)
Open `App.xcworkspace`, select the **App** target → **Signing & Capabilities**:
- **Bundle Identifier:** `com.vidcliply.app` (must match `capacitor.config.ts`).
- **Team:** select your Apple Developer team → enable **Automatically manage signing**
  (Xcode creates the certificate + provisioning profile for you). *Needs your account.*
- **Display Name:** VidCliply
- **Version:** `1.0.0`  **Build:** `1`
- **Deployment target:** iOS 14.0+.
- **Info.plist** — add usage strings you'll need (saving videos to the library):
  - `NSPhotoLibraryAddUsageDescription` = "Save downloaded videos to your Photos library."

## 6. Archive & upload
1. Xcode → device target set to **Any iOS Device (arm64)**.
2. **Product → Archive**.
3. In the Organizer → **Distribute App → App Store Connect → Upload**.
   (Signing is automatic if step 5 is set. *Needs your account.*)

---

# App Store Connect — create & submit the listing

All of this is in your Apple account — **I can't do these steps for you**, but here's
the exact sequence. Full copy is in `ios/APP-STORE-LISTING.md`.

1. **developer.apple.com → Certificates, IDs & Profiles → Identifiers** → register
   App ID `com.vidcliply.app` (or let Xcode auto-create it in step 5).
2. **appstoreconnect.apple.com → Apps → +** → New App:
   - Platform iOS, Name **VidCliply**, Primary language English (U.S.),
     Bundle ID `com.vidcliply.app`, SKU `vidcliply-ios-001`.
3. **App Information:** subtitle, category (Primary **Photo & Video**, Secondary
   **Utilities**), and the privacy policy URL `https://vidcliply.com/privacy`.
4. **Pricing:** Free.
5. **Prepare version 1.0:**
   - **Screenshots:** upload from `ios/appstore/marketing/6.7/` (required) and
     `6.5/` and `5.5/` (upload the framed ones; raw ones are in `screenshots/`).
   - **Promotional text, Description, Keywords** — paste from `APP-STORE-LISTING.md`.
   - **App icon** is taken from the build; the 1024 marketing icon is
     `ios/appstore/icon/AppIcon-1024.png`.
6. **App Privacy** (questionnaire): declare what the API collects. VidCliply keeps
   no accounts and deletes files after delivery — most answers are "Data Not
   Collected"; if you use analytics, declare it. *You must confirm this truthfully.*
7. **App Review Information:** add notes — *"VidCliply downloads video content the
   user owns or has the rights to (own uploads, Creative Commons, licensed media).
   No login required."* Provide a demo Creative-Commons URL for the reviewer.
8. If you added IAP (see IAP-PLAN.md), create the products and attach them to the
   version, or leave Pro out of v1.
9. **Add for Review → Submit**.

---

## Updating the app later
```bash
# from video/client, after web changes:
VITE_HIDE_PRO=1 VITE_API_URL=https://clipvault-api-production.up.railway.app npm run build
npx cap sync ios
# bump Build number in Xcode, Archive, Upload, submit new version.
```

## Files map
```
ios/
├── README.md                 ← you are here (build + publish runbook)
├── APP-STORE-LISTING.md      ← name, subtitle, description, keywords, promo
├── IAP-PLAN.md               ← StoreKit / In-App Purchase migration plan
└── appstore/
    ├── icon/                 ← AppIcon-1024.png (submit) + all sizes + master SVG
    ├── screenshots/          ← raw device-size captures (6.7 / 6.5 / 5.5)
    └── marketing/            ← framed, captioned App Store screenshots
client/
├── capacitor.config.ts       ← appId com.vidcliply.app, webDir dist
├── assets/                   ← icon.png + splash.png(+dark) for @capacitor/assets
└── src/native/bootstrap.ts   ← native status bar / splash / back button
```
