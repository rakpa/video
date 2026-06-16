import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const configPath = path.join(root, 'stitch.config.json');

if (!fs.existsSync(configPath)) {
  console.error('Missing stitch.config.json');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const exportDir = path.resolve(root, config.exportDir || `../stitch-${config.projectId}`);
const codeDir = path.join(exportDir, 'code');
const outFile = path.join(root, 'src/content/stitchPages.ts');

function extractBody(html) {
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  return match ? match[1].trim() : html;
}

function replaceImages(html) {
  let result = html;
  const imageMap = config.imageMap || {};
  for (const [prefix, localPath] of Object.entries(imageMap)) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`https://lh3\\.googleusercontent\\.com/aida-public/${escaped}[^"']*`, 'g'),
      localPath,
    );
  }
  return result;
}

function setLink(html, fromHref, toRoute) {
  const escaped = fromHref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.replace(
    new RegExp(`<a([^>]*?)href="${escaped}"([^>]*)>`, 'g'),
    `<a$1href="${toRoute}" data-route="${toRoute}"$2>`,
  );
}

function wireRoutes(html) {
  let result = html;
  result = result.replace(
    /<a class="flex items-center gap-2 group" href="#"/,
    '<a class="flex items-center gap-2 group" href="/" data-route="/"',
  );

  const navMap = {
    '#features': '/features',
    '#how-it-works': '/#how-it-works',
    '#pricing': '/pricing',
    '/history': '/history',
    '#get-started': '/#get-started',
  };
  for (const [from, to] of Object.entries(navMap)) {
    result = setLink(result, from, to);
  }

  const footerMap = {
    '#privacy': '/privacy-policy',
    '#terms': '/terms-of-service',
    '#contact': '/contact',
    '#api': '/api',
  };
  for (const [from, to] of Object.entries(footerMap)) {
    result = setLink(result, from, to);
  }

  const entityRoutes = config.entityRoutes || {};
  for (const [title, route] of Object.entries(entityRoutes)) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(
        `(<div class="bg-surface rounded-xl p-8 border border-outline-variant/20 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">[\\s\\S]*?<h3[^>]*>${escaped}</h3>[\\s\\S]*?</p>\\s*</div>)`,
        'g',
      ),
      (match) =>
        match.includes('data-route')
          ? match
          : match.replace(
              'relative overflow-hidden group">',
              `relative overflow-hidden group cursor-pointer" data-route="${route}" role="link" tabindex="0">`,
            ),
    );
  }

  return result;
}

function wireDownloader(html) {
  let result = html;
  result = result.replace(
    /<input class="w-full h-14[^"]*"([^>]*)type="url"([^>]*)value="[^"]*"/,
    '<input id="stitch-url-input" data-stitch="url-input" class="w-full h-14 pl-12 pr-4 bg-surface-container-lowest text-on-surface border-none rounded-lg focus:ring-0 text-[16px] placeholder:text-outline-variant"$1type="url"$2value=""',
  );
  result = result.replace(
    /<button class="h-14 px-8 bg-primary[^"]*" type="button">/,
    '<button id="stitch-analyze-btn" data-stitch="analyze" class="h-14 px-8 bg-primary text-on-primary rounded-lg font-label-md text-label-md shadow-sm hover:shadow-md hover:bg-on-primary-fixed-variant transition-all duration-200 flex items-center justify-center gap-2 whitespace-nowrap group" type="button">',
  );
  result = result.replace(
    /<!-- Integrated Search Results -->/,
    '<!-- Integrated Search Results --><div id="stitch-results" data-stitch="results" class="hidden">',
  );
  result = result.replace(
    /<!-- How it Works Section/,
    '</div><!-- How it Works Section',
  );
  result = result.replace(/bg-surface-lowest/g, 'bg-surface-container-lowest');
  result = result.replace(/<script>[\s\S]*?<\/script>\s*$/, '');
  result = result.replace(
    /<section class="relative pt-stack-xl pb-stack-xl md:pt-32 md:pb-24 overflow-hidden px-margin-mobile md:px-margin-desktop">/,
    '<section id="get-started" class="relative pt-stack-xl pb-stack-xl md:pt-32 md:pb-24 overflow-hidden px-margin-mobile md:px-margin-desktop">',
  );
  result = result.replace(
    /<h3 class="font-title-lg text-title-lg text-on-surface mb-stack-md">Select Format<\/h3>\s*<div class="flex flex-col gap-stack-md">/,
    '<h3 class="font-title-lg text-title-lg text-on-surface mb-stack-md">Select Format</h3>\n<div data-stitch="format-list" class="flex flex-col gap-stack-md">',
  );
  return result;
}

function processHtml(raw) {
  return wireDownloader(wireRoutes(replaceImages(extractBody(raw))));
}

const screens = config.screens || {};
const entries = Object.entries(screens).map(([key, screen]) => {
  const htmlFile = path.join(codeDir, screen.htmlFile);
  if (!fs.existsSync(htmlFile)) throw new Error(`Missing HTML file: ${htmlFile}`);
  return [key, processHtml(fs.readFileSync(htmlFile, 'utf8'))];
});

const output = `/* Auto-generated — run: npm run process-stitch */\n\nexport const stitchPages = {\n${entries
  .map(([key, html]) => `  ${key}: ${JSON.stringify(html)},`)
  .join('\n')}\n} as const;\n\nexport type StitchPageKey = keyof typeof stitchPages;\n\nexport const stitchRoutes = ${JSON.stringify(
  Object.fromEntries(Object.entries(screens).map(([key, s]) => [key, s.route])),
  null,
  2,
)} as const;\n`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, output, 'utf8');
console.log(`Wrote ${outFile}`);
console.log(`Screens processed: ${entries.length}`);
