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

// Render dashboard with charts and auto-refresh
function renderDashboard(stats: any, username: string): string {
  const platforms = Object.keys(stats.byPlatform);
  const platformCounts = Object.values(stats.byPlatform);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VidCliply • Admin Stats</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    .stat-card { transition: transform 0.2s ease; }
    .stat-card:hover { transform: translateY(-2px); }
  </style>
</head>
<body class="bg-slate-950 text-white">
  <div class="max-w-7xl mx-auto p-6">
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 bg-white rounded-2xl flex items-center justify-center">
          <span class="text-3xl font-bold text-slate-900">V</span>
        </div>
        <div>
          <h1 class="text-3xl font-bold">VidCliply Admin</h1>
          <p class="text-slate-400">Welcome back, <span class="text-white font-medium">${username}</span></p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <div id="refresh-status" class="px-4 py-2 bg-slate-900 border border-slate-700 rounded-2xl text-sm flex items-center gap-2">
          <i class="fa-solid fa-sync fa-spin text-emerald-400"></i>
          <span>Auto-refresh: <span id="countdown">30</span>s</span>
        </div>
        <button onclick="toggleAutoRefresh()" id="refresh-btn"
                class="px-5 py-2.5 text-sm font-medium bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-2xl flex items-center gap-2">
          <i class="fa-solid fa-pause"></i>
          <span>Pause</span>
        </button>
        <a href="/admin/stats" class="px-5 py-2.5 text-sm font-medium bg-white text-slate-900 rounded-2xl flex items-center gap-2 hover:bg-slate-100">
          <i class="fa-solid fa-redo"></i>
          <span>Refresh</span>
        </a>
      </div>
    </div>

    <!-- Stats Overview -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="stat-card bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm text-slate-400">Total Downloads</div>
            <div class="text-6xl font-bold mt-2">${stats.totalDownloads.toLocaleString()}</div>
          </div>
          <i class="fa-solid fa-download text-4xl text-slate-700"></i>
        </div>
      </div>

      <div class="stat-card bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-sm text-slate-400">Today</div>
            <div class="text-6xl font-bold mt-2 text-emerald-400">${stats.todayDownloads.toLocaleString()}</div>
          </div>
          <i class="fa-solid fa-calendar-day text-4xl text-emerald-700"></i>
        </div>
      </div>

      <div class="stat-card bg-slate-900 border border-slate-800 rounded-3xl p-6">
        <div class="text-sm text-slate-400 mb-4">By Platform</div>
        <canvas id="platformChart" width="300" height="180"></canvas>
      </div>
    </div>

    <!-- Recent Downloads Table -->
    <div class="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <h2 class="font-semibold text-xl">Recent Downloads <span class="text-sm text-slate-500 font-normal">(last 50)</span></h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="bg-slate-950 text-left text-sm">
              <th class="py-4 px-6 font-medium text-slate-400">Time</th>
              <th class="py-4 px-5 font-medium text-slate-400">Platform</th>
              <th class="py-4 px-5 font-medium text-slate-400">Quality</th>
              <th class="py-4 px-5 text-center font-medium text-slate-400">Resolution</th>
              <th class="py-4 px-5 text-center font-medium text-slate-400">Country</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800 text-sm">
            ${stats.recentDownloads.map((d: any) => `
              <tr>
                <td class="py-4 px-6 text-slate-400">${new Date(d.time).toLocaleString()}</td>
                <td class="py-4 px-5"><span class="px-3 py-1 bg-slate-800 rounded-full text-xs font-medium">${d.platform}</span></td>
                <td class="py-4 px-5 font-mono">${d.quality}</td>
                <td class="py-4 px-5 text-center">${d.height ? d.height + 'p' : '-'}</td>
                <td class="py-4 px-5 text-center text-emerald-400">${d.country || '-'}</td>
              </tr>
            `).join('') || '<tr><td colspan="5" class="py-12 text-center text-slate-500">No downloads recorded yet</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="mt-6 text-center text-xs text-slate-500">
      Auto-updates every 30 seconds • Last updated: <span id="last-updated">${new Date().toLocaleTimeString()}</span>
    </div>
  </div>

  <script>
    // Platform Chart
    const ctx = document.getElementById('platformChart');
    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ${JSON.stringify(platforms)},
        datasets: [{
          data: ${JSON.stringify(platformCounts)},
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'right',
            labels: { color: '#64748b', font: { size: 12 } }
          }
        }
      }
    });

    // Auto-refresh functionality
    let autoRefreshInterval = null;
    let countdownInterval = null;
    let secondsLeft = 30;
    let isAutoRefreshEnabled = true;

    function updateCountdown() {
      const el = document.getElementById('countdown');
      if (el) el.textContent = secondsLeft;
    }

    function startAutoRefresh() {
      if (autoRefreshInterval) clearInterval(autoRefreshInterval);
      if (countdownInterval) clearInterval(countdownInterval);

      secondsLeft = 30;
      updateCountdown();

      countdownInterval = setInterval(() => {
        secondsLeft--;
        updateCountdown();
        if (secondsLeft <= 0) {
          location.reload();
        }
      }, 1000);

      autoRefreshInterval = setTimeout(() => {
        location.reload();
      }, 30000);
    }

    function toggleAutoRefresh() {
      const btn = document.getElementById('refresh-btn');
      const status = document.getElementById('refresh-status');

      isAutoRefreshEnabled = !isAutoRefreshEnabled;

      if (isAutoRefreshEnabled) {
        btn.innerHTML = '<i class="fa-solid fa-pause"></i> <span>Pause</span>';
        status.innerHTML = '<i class="fa-solid fa-sync fa-spin text-emerald-400"></i> <span>Auto-refresh: <span id="countdown">30</span>s</span>';
        startAutoRefresh();
      } else {
        btn.innerHTML = '<i class="fa-solid fa-play"></i> <span>Resume</span>';
        status.innerHTML = '<i class="fa-solid fa-pause text-amber-400"></i> <span>Auto-refresh paused</span>';
        if (autoRefreshInterval) clearTimeout(autoRefreshInterval);
        if (countdownInterval) clearInterval(countdownInterval);
      }
    }

    // Start auto-refresh on page load
    window.onload = function() {
      startAutoRefresh();
      // Update last updated time
      const lastUpdated = document.getElementById('last-updated');
      if (lastUpdated) lastUpdated.textContent = new Date().toLocaleTimeString();
    }

    // Keyboard shortcut: R to refresh
    document.addEventListener('keydown', function(e) {
      if (e.key.toLowerCase() === 'r' && !e.target.matches('input')) {
        e.preventDefault();
        location.reload();
      }
    });
  </script>
</body>
</html>`;
}

export default router;
