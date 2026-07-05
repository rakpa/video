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

// Render login page (Light theme)
function renderLoginPage(errorMessage = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Login • VidCliply</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 text-slate-900 flex items-center justify-center min-h-screen">
  <div class="w-full max-w-md px-6">
    <div class="text-center mb-8">
      <div class="mx-auto w-16 h-16 bg-white shadow rounded-2xl flex items-center justify-center mb-4 border">
        <span class="text-3xl font-bold text-slate-900">V</span>
      </div>
      <h1 class="text-3xl font-bold text-slate-900">VidCliply Admin</h1>
      <p class="text-slate-500 mt-2">Sign in to view download statistics</p>
    </div>

    <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-8">
      ${errorMessage ? `<div class="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-sm">${errorMessage}</div>` : ''}

      <form method="POST" action="/admin/stats/login" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-slate-600 mb-1.5">Username</label>
          <input type="text" name="username" value="rakpa" required
                 class="w-full border border-slate-300 focus:border-slate-500 rounded-2xl px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none">
        </div>

        <div>
          <label class="block text-sm font-medium text-slate-600 mb-1.5">Password</label>
          <input type="password" name="password" required
                 class="w-full border border-slate-300 focus:border-slate-500 rounded-2xl px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none">
        </div>

        <button type="submit"
                class="w-full bg-slate-900 hover:bg-black transition-colors text-white font-semibold py-3.5 rounded-2xl mt-2">
          Sign In
        </button>
      </form>
    </div>

    <p class="text-center text-xs text-slate-400 mt-6">Protected area • VidCliply</p>
  </div>
</body>
</html>`;
}

// Simple clean light theme dashboard
function renderDashboard(stats: any, username: string): string {
  const byPlatform = Object.entries(stats.byPlatform)
    .map(([platform, count]) => `
      <div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-none">
        <span class="font-medium">${platform}</span>
        <span class="font-mono text-xl">${count}</span>
      </div>
    `)
    .join('');

  const recentRows = stats.recentDownloads
    .map((d: any) => `
      <tr class="border-b border-slate-100">
        <td class="py-3 px-4 text-sm text-slate-500">${new Date(d.time).toLocaleString()}</td>
        <td class="py-3 px-4"><span class="px-3 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">${d.platform}</span></td>
        <td class="py-3 px-4 font-mono text-sm">${d.quality}</td>
        <td class="py-3 px-4 text-center">${d.height ? d.height + 'p' : '-'}</td>
        <td class="py-3 px-4 text-center text-emerald-600">${d.country || '-'}</td>
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
<body class="bg-slate-100 text-slate-900">
  <div class="max-w-6xl mx-auto p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-8">
      <div class="flex items-center gap-4">
        <div class="w-11 h-11 bg-white shadow border rounded-2xl flex items-center justify-center">
          <span class="text-2xl font-bold text-slate-900">V</span>
        </div>
        <div>
          <h1 class="text-3xl font-bold text-slate-900">VidCliply Admin</h1>
          <p class="text-slate-500 text-sm">Welcome back, <span class="font-medium text-slate-900">${username}</span></p>
        </div>
      </div>

      <div>
        <a href="/admin/stats" class="px-5 py-2.5 text-sm font-medium bg-white border border-slate-300 hover:bg-slate-50 rounded-2xl flex items-center gap-2">
          <i class="fa-solid fa-redo"></i>
          <span>Refresh</span>
        </a>
      </div>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-6">
        <div class="text-sm text-slate-500 mb-1">Total Downloads</div>
        <div class="text-6xl font-bold text-slate-900">${stats.totalDownloads.toLocaleString()}</div>
      </div>

      <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-6">
        <div class="text-sm text-slate-500 mb-1">Today</div>
        <div class="text-6xl font-bold text-emerald-600">${stats.todayDownloads.toLocaleString()}</div>
      </div>

      <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-6">
        <div class="text-sm text-slate-500 mb-4">By Platform</div>
        <div class="space-y-1 text-sm">
          ${byPlatform || '<div class="text-slate-400 py-4">No data yet</div>'}
        </div>
      </div>
    </div>

    <!-- Recent Downloads -->
    <div class="bg-white border border-slate-200 shadow-sm rounded-3xl overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 class="font-semibold text-lg text-slate-900">Recent Downloads <span class="text-sm text-slate-400 font-normal">(last 50)</span></h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 text-left">
              <th class="py-4 px-6 font-medium text-slate-500">Time</th>
              <th class="py-4 px-5 font-medium text-slate-500">Platform</th>
              <th class="py-4 px-5 font-medium text-slate-500">Quality</th>
              <th class="py-4 px-5 text-center font-medium text-slate-500">Resolution</th>
              <th class="py-4 px-5 text-center font-medium text-slate-500">Country</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${recentRows || '<tr><td colspan="5" class="py-10 text-center text-slate-400">No downloads yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-6 text-center text-xs text-slate-400">
      Logged in as <span class="font-medium text-slate-600">${username}</span>
    </div>
  </div>
</body>
</html>`;
}

export default router;
