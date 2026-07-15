/**
 * Copies Stitch HTML exports into Flutter assets and patches broken image URLs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const exportCodeDir = path.join(
  process.env.USERPROFILE || process.env.HOME,
  'Downloads',
  'stitch-9661105501663215896',
  'code',
);
const outDir = path.join(repoRoot, 'assets', 'stitch', 'html');
const logoPath = path.join(repoRoot, 'assets', 'stitch', 'splash_icon.png');
const logoFallback = path.join(repoRoot, 'assets', 'stitch', '01_logo.png');

const fileMap = [
  ['Splash Screen__197ed8f6678f4a18a59af5069b47d0be.html', 'splash.html'],
  ['Onboarding - Auto-Crop__fff43507cce24fd29cce8242a3c9d317.html', 'onboarding_auto_crop.html'],
  ['Smart Capture__d0a41010a03846aa8eabf26af04b8641.html', 'smart_capture.html'],
  ['Perspective Crop__2a4fffaeb4e24f329d50a3436e90dce3.html', 'perspective_crop.html'],
  ['Filter & Enhance__0cc6bbb3ad6749ffad01177dd1519216.html', 'filter_enhance.html'],
  ['Document Export__daadda10a3c047c89586d8cefbee0fd7.html', 'document_export.html'],
  ['Dashboard__f7de3bf3b396400da1292721661ab7ab.html', 'dashboard.html'],
  ['Premium Dashboard__7a35f69f02aa4d32a57f93c5a1ef39e9.html', 'premium_dashboard.html'],
  ['Settings__c96561b106a14e32b98cc356a843b267.html', 'settings.html'],
  ['Premium Smart Capture__1249d10228124fb6a040e047744ce76a.html', 'premium_smart_capture.html'],
  ['Premium Document Export__0a8cd35a910d4792a19ebc30686ea269.html', 'premium_document_export.html'],
  ['Premium Splash Screen__f1260389a8ba4ebb8df83f18aea7c9e7.html', 'premium_splash.html'],
];

const brokenLogoUrl =
  'https://lh3.googleusercontent.com/aida/AP1WRLu8VkrPdJeW75OCXpCbSY_2UkOU29EUKTdBB4R56A5nD_JU4-0KTN_OK_6nxXA4GXYC8tRO1ONQPkxL9J1hAZIZSOjX1AtRHqYCZEjhoQp6nCGBKNZ55ChgIfgJASKdLb1ylQlKRnoKQGynpMWWFO51xslEEAHvL7OpXmy5i6kCKZprsL6XsgJaPn90nIaZDIg_nbos8x9vTIXr6dEetwI9_p-ghgUF5Y__RuLuJWpilI7nI9ifKHVzuw';

function patchHtml(html) {
  let out = html;
  const iconFile = fs.existsSync(logoPath) ? logoPath : logoFallback;
  if (fs.existsSync(iconFile)) {
    const b64 = fs.readFileSync(iconFile).toString('base64');
    const dataUri = `data:image/png;base64,${b64}`;
    out = out.split(brokenLogoUrl).join(dataUri);
  }
  // Keep device-width viewport so Tailwind md: breakpoints work on real phones.
  out = out.replace(
    /content="width=device-width[^"]*"/g,
    'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"',
  );
  out = out.replace(
    /content="width=780[^"]*"/g,
    'content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"',
  );
  // Remove legacy fixed-canvas lock if re-exporting old Stitch files.
  out = out.replace(/<style id="stitch-flutter-fit">[\s\S]*?<\/style>/g, '');
  out = out.replaceAll('â€¢', ' · ');
  return out;
}

fs.mkdirSync(outDir, { recursive: true });

for (const [srcName, destName] of fileMap) {
  const src = path.join(exportCodeDir, srcName);
  if (!fs.existsSync(src)) {
    console.error(`Missing: ${src}`);
    continue;
  }
  const html = patchHtml(fs.readFileSync(src, 'utf8'));
  fs.writeFileSync(path.join(outDir, destName), html);
  console.log(`Prepared ${destName}`);
}

const manifest = fileMap.map(([, destName]) => destName);
fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify(manifest, null, 2),
);
console.log(`\nDone → ${outDir}`);
