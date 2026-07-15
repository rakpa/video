/**
 * Renders full-resolution PNGs from Stitch HTML exports (780Ã—1768+).
 * Stitch API thumbnails are ~226Ã—512 and look blurry when scaled up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const exportDir = path.join(
  process.env.HOME || process.env.USERPROFILE,
  'Downloads',
  'stitch-9661105501663215896',
);
const outDir = path.join(repoRoot, 'assets', 'stitch');

const titleToFile = {
  'Scanella Premium Logo': '01_logo.png',
  'Splash Screen': '00_splash.png',
  'Onboarding - Auto-Crop': '02_onboarding_auto_crop.png',
  'Smart Capture': '03_smart_capture.png',
  'Perspective Crop': '04_perspective_crop.png',
  'Filter & Enhance': '05_filter_enhance.png',
  'Document Export': '06_document_export.png',
  Dashboard: '07_dashboard.png',
  'Premium Dashboard': '08_premium_dashboard.png',
  Settings: '09_settings.png',
  'Premium Smart Capture': '10_premium_smart_capture.png',
  'Premium Document Export': '11_premium_document_export.png',
};

const manifestPath = path.join(exportDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`Missing manifest: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

for (const entry of manifest) {
  const outName = titleToFile[entry.title];
  if (!outName) {
    console.log(`Skip (no mapping): ${entry.title}`);
    continue;
  }

  const htmlPath = entry.codeFile;
  if (!fs.existsSync(htmlPath)) {
    console.error(`Missing HTML: ${htmlPath}`);
    continue;
  }

  const width = Math.max(1, parseInt(entry.width, 10) || 780);
  const height = Math.max(1, parseInt(entry.height, 10) || 1768);
  const outPath = path.join(outDir, outName);

  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });

  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`, {
    waitUntil: 'networkidle',
    timeout: 60_000,
  });
  await page.waitForTimeout(800);

  await page.screenshot({
    path: outPath,
    fullPage: true,
    type: 'png',
  });

  await page.close();
  const stat = fs.statSync(outPath);
  console.log(`Rendered ${outName} (${width}Ã—${height} canvas, ${Math.round(stat.size / 1024)} KB)`);
}

await browser.close();
console.log(`\nDone. Assets written to ${outDir}`);

