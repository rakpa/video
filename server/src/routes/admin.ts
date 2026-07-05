import { Router, Request, Response } from 'express';
import { getDownloadStats } from '../utils/downloadLogger.js';

const router = Router();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'change-me-in-env';

// Simple HTML admin dashboard
function renderAdminPage(stats: any, token: string): string {
  const byPlatform = Object.entries(stats.byPlatform)
    .map(([platform, count]) => `<div class="flex justify-between items-center mb-2">
      <span class="font-medium">${platform}</span>
      <span class="font-mono text-lg">${count}</span>
    </div>`)
    .join('');

  const recentRows = stats.recentDownloads
    .map((d: any) => `
      <tr class="border-b border-slate-100">
        <td class="py-2 px-3 text-sm text-slate-500">${new Date(d.time).toLocaleString()}</td>
        <td class="py-2 px-3"><span class="px-2 py-0.5 rounded bg-slate-100 text-xs font-medium">${d.platform}</span></td>
        <td class="py-2 px-3 font-mono text-sm">${d.quality}</td>
        <td class="py-2 px-3 text-center">${d.height ? d.height + 'p' : '-'}</td>
        <td class="py-2 px-3 text-center">${d.country || '-'}</td>
      </tr>
    `)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VidCliply • Admin Stats</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
</head>
<body class="bg-slate-50">
  <div class="max-w-6xl mx-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-3xl font-bold text-slate-900">VidCliply Admin</h1>
        <p class="text-slate-500">Download Statistics</p>
      </div>
      <div class="flex items-center gap-3">
        <div class="px-4 py-2 bg-white rounded-2xl shadow-sm border text-sm">
          <i class="fa-solid fa-sync mr-2 text-emerald-500"></i>
          Live data
        </div>
        <a href="/" class="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">Back to app</a>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="bg-white rounded-3xl p-6 shadow-sm border">
        <div class="text-sm text-slate-500 mb-1">Total Downloads</div>
        <div class="text-5xl font-bold text-slate-900">${stats.totalDownloads.toLocaleString()}</div>
      </div>
      <div class="bg-white rounded-3xl p-6 shadow-sm border">
        <div class="text-sm text-slate-500 mb-1">Today</div>
        <div class="text-5xl font-bold text-emerald-600">${stats.todayDownloads.toLocaleString()}</div>
      </div>
      <div class="bg-white rounded-3xl p-6 shadow-sm border">
        <div class="text-sm text-slate-500 mb-3">By Platform</div>
        <div class="space-y-1 text-sm">${byPlatform}</div>
      </div>
    </div>

    <!-- Recent Downloads -->
    <div class="bg-white rounded-3xl shadow-sm border overflow-hidden">
      <div class="px-6 py-4 border-b flex items-center justify-between">
        <h2 class="font-semibold text-lg">Recent Downloads <span class="text-sm text-slate-400">(last 50)</span></h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 text-left">
              <th class="py-3 px-6 font-medium text-slate-500">Time</th>
              <th class="py-3 px-4 font-medium text-slate-500">Platform</th>
              <th class="py-3 px-4 font-medium text-slate-500">Quality</th>
              <th class="py-3 px-4 text-center font-medium text-slate-500">Resolution</th>
              <th class="py-3 px-4 text-center font-medium text-slate-500">Country</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            ${recentRows || '<tr><td colspan="5" class="py-8 text-center text-slate-400">No downloads yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-6 text-xs text-slate-400 text-center">
      Data updates in real-time • Last refreshed: ${new Date().toLocaleTimeString()}
    </div>
  </div>
</body>
</html>`;
}

// Protected admin dashboard
router.get('/stats', (req: Request, res: Response) => {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token !== ADMIN_TOKEN) {
    return res.status(403).send(`
      <html><body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h2>Unauthorized</h2>
        <p>Please provide a valid admin token.</p>
      </body></html>
    `);
  }

  try {
    const stats = getDownloadStats();
    res.send(renderAdminPage(stats, String(token)));
  } catch (err) {
    res.status(500).send('Error loading stats');
  }
});

export default router;
