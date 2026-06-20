/**
 * Build client and write a valid Vercel Build Output API v3 tree.
 * Use with: vercel deploy --prebuilt --prod --yes
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const outputRoot = join(root, '.vercel', 'output');
const staticRoot = join(outputRoot, 'static');
const dist = join(root, 'client', 'dist');

execSync('npm run build --prefix client', { stdio: 'inherit', cwd: root });

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(staticRoot, { recursive: true });
cpSync(dist, staticRoot, { recursive: true });

writeFileSync(
  join(outputRoot, 'config.json'),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { handle: 'filesystem' },
        { src: '/(.*)', dest: '/index.html' },
      ],
    },
    null,
    2,
  ),
);

console.log('Wrote .vercel/output with config.json + static assets');
