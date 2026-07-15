# Paperly (scan2)

Paperly is a Flutter document scanner (`doc_scanner`) built with Material 3,
Riverpod, go_router, Drift, and on-device image processing. Original branding —
not a CamScanner clone — with no paywall, cloud sync, accounts, or subscriptions.

> **Repo note:** `github.com/rakpa/scan2` did not exist when this agent ran, and
> the cloud session was attached to `rakpa/video`. This branch is an orphan
> Flutter tree intended to be copied into a new `rakpa/scan2` repository
> (`git push <scan2-remote> HEAD:main`).

## Features

- Camera scan flow with live edge detection overlay, ~1s auto-capture, manual shutter,
  flash toggle, batch page thumbnails, and gallery import.
- Crop editor with 4 draggable corner handles, loupe while dragging, Re-detect, and
  Use full image; pure-Dart homography perspective correction on both platforms.
- On-device OCR via `google_mlkit_text_recognition` (offline); extract/copy/share `.txt`
  and store text so library search matches page contents.
- Gallery import into the same scan pipeline.
- Filters: Original, Color, Auto, Magic Color, Lighten, Grayscale, and adaptive
  B&W.
- Library with folders, title search, date/name sorting, grid/list toggle,
  rename/delete/move/duplicate, and page drag-to-reorder.
- Export sheet on document detail:
  - Share PDF
  - Save PDF into the app exports folder
  - Print with `printing`
  - Export per-page JPGs as a ZIP
  - Save JPG pages to the device gallery with `gal`
- Settings for theme, auto-capture default, default filter, PDF page size, and
  file name pattern (`Scan {date}` -> `Scan 2026-07-15 (1)`).
- iOS simulator CI, iOS signed IPA workflow, Android signed AAB workflow.

PDF password protection is intentionally skipped: the pure-Dart `pdf` package
used here does not expose an encryption/password API.

## Architecture

```
lib/
  app/                 MaterialApp.router, theme, routes
  core/                app-wide providers, storage, design tokens
  data/database/       Drift schema and database helpers
  features/
    documents/         repository contract/impl, library/detail UI
    enhance/           DocFilter enum and image pipeline
    export/            PDF/JPG/ZIP services and export sheet
    folders/           folder repository and UI
    home/              dashboard, feed, search/sort/view toggles
    onboarding/        first-run completion only
    scan/              camera/gallery capture and perspective crop
    settings/          hand-written Riverpod preference notifiers
```

Presentation code depends on repository interfaces; Drift and disk storage live
behind data-layer implementations. Riverpod providers are hand-written.

## Local setup

Use the Flutter SDK requested for this project:

```bash
export PATH="/home/ubuntu/flutter-3.44.6/bin:$PATH"
flutter pub get
dart run build_runner build --delete-conflicting-outputs
flutter test
```

Windows PowerShell Flutter path note:

```powershell
$env:Path = "C:\src\flutter\bin;" + $env:Path
```

Install a debug build on a connected Android device:

```bash
flutter install --debug -d CPH2569
```

## Release notes

- Android package/application ID: `com.paperly.scanner`.
- iOS bundle ID: `com.paperly.scanner`.
- Android release signing is documented in `android/KEYSTORE.md`.
- iOS signing from Windows is documented in `ios/README.md`.

## Current OCR hook

Library search matches titles today. The feed contains an explicit TODO hook to
include OCR text when the OCR persistence column lands.
