import { Router, Request, Response } from 'express';
import express from 'express';
import { getDownloadStats } from '../utils/downloadLogger.js';
import { verifyAdmin } from '../utils/adminAuth.js';

const router = Router();

// Login page
router.get('/stats', (req: Request, res: Response) => {
  res.send(renderLoginPage());
});

// Handle login
router.post('/stats/login', express.urlencoded({ extended: true }), (req: Request, res: Response) => {
  const { username, password } = req.body;

  if (verifyAdmin(username, password)) {
    try {
      const stats = getDownloadStats();
      return res.send(renderDashboard(stats, username));
    } catch (err) {
      return res.status(500).send('Error loading stats');
    }
  }

  res.send(renderLoginPage('Invalid username or password'));
});

// Render login page
function renderLoginPage(errorMessage = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login • VidCliply</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-white flex items-center justify-center min-h-screen">
  <div class="w-full max-w-md px-6">
    <div class="text-center mb-8">
      <div class="mx-auto w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4">
        <span class="text-3xl font-bold text-slate-900">V</span>
      </div>
      <h1 class="text-3xl font-bold">VidCliply Admin</h1>
      <p class="text-slate-400 mt-2">Sign in to view download statistics</p>
    </div>

    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-8">
      ${errorMessage ? `<div class="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-2xl text-sm">${errorMessage}</div>` : ''}

      <form method="POST" action="/admin/stats/login" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1.5">Username</label>
          <input type="text" name="username" value="rakpa" required
                 class="w-full bg-slate-950 border border-slate-700 focus:border-slate-500 rounded-2xl px-4 py-3 text-white placeholder:text-slate-500 outline-none">
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
          <input type="password" name="password" required
                 class="w-full bg-slate-950 border border-slate-700 focus:border-slate-500 rounded-2xl px-4 py-3 text-white placeholder:text-slate-500 outline-none">
        </div>

        <button type="submit"
                class="w-full bg-white hover:bg-slate-200 transition-colors text-slate-900 font-semibold py-3.5 rounded-2xl mt-2">
          Sign In
        </button>
      </form>
    </div>

    <p class="text-center text-xs text-slate-500 mt-6">Protected area • VidCliply</p>
  </div>
</body>
</html>`;
}

// Simple clean dashboard (no chart)
function renderDashboard(stats: any, username: string): string {
  const byPlatform = Object.entries(stats.byPlatform)
    .map(([platform, count]) => `
      <div class="flex justify-between items-center py-2 border-b border-slate-700 last:border-none">
        <span class="font-medium">${platform}</span>
        <span class="font-mono text-xl">${count}</span>
      </div>
    `)
    .join('');

  const recentRows = stats.recentDownloads
    .map((d: any) => `
      <tr class="border-b border-slate-700">
        <td class="py-3 px-4 text-sm text-slate-400">${new Date(d.time).toLocaleString()}</td>
        <td class="py-3 px-4"><span class="px-3 py-1 rounded-full bg-slate-800 text-xs font-medium">${d.platform}</span></td>
        <td class="py-3 px-4 font-mono text-sm">${d.quality}</td>
        <td class="py-3 px-4 text-center">${d.height ? d.height + 'p' : '-'}</td>
        <td class="py-3 px-4 text-center text-emerald-400">${d.country || '-'}</td>
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
<body class="bg-slate-950 text-white">
  <div class="max-w-6xl mx-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-4">
        <div class="w-11 h-11 bg-white rounded-2xl flex items-center justify-center">
          <span class="text-2xl font-bold text-slate-900">V</span>
        </div>
        <div>
          <h1 class="text-3xl font-bold">VidCliply Admin</h1>
          <p class="text-slate-400 text-sm">Welcome back, <span class="text-white">${username}</span></p>
        </div>
      </div>

      <div>
        <a href="/admin/stats" class="px-5 py-2.5 text-sm font-medium bg-white text-slate-900 rounded-2xl flex items-center gap-2 hover:bg-slate-100">
          <i class="fa-solid fa-redo"></i>
          <span>Refresh</span>
        </a>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div class="text-sm text-slate-400 mb-1">Total Downloads</div>
        <div class="text-6xl font-bold">${stats.totalDownloads.toLocaleString()}</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div class="text-sm text-slate-400 mb-1">Today</div>
        <div class="text-6xl font-bold text-emerald-400">${stats.todayDownloads.toLocaleString()}</div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div class="text-sm text-slate-400 mb-4">By Platform</div>
        <div class="space-y-1 text-sm">
          ${byPlatform || '<div class="text-slate-500 py-4">No data yet</div>'}
        </div>
      </div>
    </div>

    <!-- Recent Downloads -->
    <div class="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <h2 class="font-semibold text-lg">Recent Downloads <span class="text-sm text-slate-500">(last 50)</span></h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-950 text-left">
              <th class="py-4 px-6 font-medium text-slate-400">Time</th>
              <th class="py-4 px-5 font-medium text-slate-400">Platform</th>
              <th class="py-4 px-5 font-medium text-slate-400">Quality</th>
              <th class="py-4 px-5 text-center font-medium text-slate-400">Resolution</th>
              <th class="py-4 px-5 text-center font-medium text-slate-400">Country</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800">
            ${recentRows || '<tr><td colspan="5" class="py-10 text-center text-slate-500">No downloads yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-6 text-center text-xs text-slate-500">
      Logged in as <span class="text-white">${username}</span>
    </div>
  </div>
</body>
</html>`;
}

export default router;
