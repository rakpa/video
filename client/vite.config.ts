import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Read PORT from server/.env so the API proxy stays in sync. */
function readServerPort(fallback = 3081): number {
  const envPath = resolve(__dirname, '../server/.env');
  if (!existsSync(envPath)) return fallback;
  const match = readFileSync(envPath, 'utf8').match(/^PORT=(\d+)/m);
  return match ? Number(match[1]) : fallback;
}

// The dev server proxies /api to the backend so the frontend can use
// same-origin relative URLs (no CORS headaches in development).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const clientPort = Number(env.VITE_DEV_PORT ?? 3080);
  const apiPort = readServerPort();

  return {
    plugins: [react()],
    server: {
      port: clientPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: `http://localhost:${apiPort}`,
          changeOrigin: true,
        },
      },
    },
  };
});
