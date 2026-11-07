import { Router, Request, Response } from 'express';
import express from 'express';
import crypto from 'node:crypto';
import { getDownloadsInRange } from '../utils/downloadLogger.js';
import { verifyAdmin } from '../utils/adminAuth.js';

const router = Router();

const TZ = 'Europe/Warsaw';
const SESSION_COOKIE = 'vc_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || crypto.randomBytes(32).toString('hex');

function sign(value: string): string {
  return crypto.createHmac('sha256', SESSION_SECRET).update(value).digest('hex');
}

function sessionUser(req: Request): string | null {
  const raw = (req.headers.cookie ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  if (!raw) return null;
  const [user, exp, mac] = decodeURIComponent(raw).split('.');
  if (!user || !exp || !mac || Number(exp) < Date.now()) return null;
  const expected = sign(`${user}.${exp}`);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  return user;
}

/** Offset of Poland's clock from UTC at a given instant (handles summer time). */
function warsawOffsetMs(t: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(t / 1000) * 1000;
}

/** 'YYYY-MM-DD' (Poland date) → UTC ms of that day's 00:00 in Poland. */
function warsawMidnight(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - warsawOffsetMs(guess - warsawOffsetMs(guess));
}

function warsawDate(t: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(t),
  );
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const STATUS_FILTERS = ['all', 'success', 'failed', 'started'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

// Dashboard (needs a session) — ?from=YYYY-MM-DD&to=YYYY-MM-DD, Poland dates, inclusive.
router.get('/stats', (req: Request, res: Response) => {
  const user = sessionUser(req);
  if (!user) return res.send(renderLoginPage());
  const today = warsawDate(Date.now());
  const from = isDate(req.query.from) ? req.query.from : today;
  const to = isDate(req.query.to) && req.query.to >= from ? req.query.to : from;
  try {
    const status = STATUS_FILTERS.includes(String(req.query.status) as StatusFilter)
      ? (String(req.query.status) as StatusFilter)
      : 'all';
    const data = getDownloadsInRange(warsawMidnight(from), warsawMidnight(addDays(to, 1)));
    res.setHeader('Cache-Control', 'no-store');
    return res.send(renderDashboard(data, user, from, to, today, status));
  } catch {
    return res.status(500).send('Error loading stats');
  }
});

// Handle login → session cookie → dashboard
router.post('/stats/login', express.urlencoded({ extended: true }), (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (verifyAdmin(username, password)) {
    const exp = String(Date.now() + SESSION_TTL_MS);
    const value = `${username}.${exp}`;
    res.setHeader(
      'Set-Cookie',
      `${SESSION_COOKIE}=${encodeURIComponent(`${value}.${sign(value)}`)}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`,
    );
    return res.redirect(303, '/admin/stats');
  }
  res.send(renderLoginPage('Invalid username or password'));
});

router.post('/stats/logout', (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  res.redirect(303, '/admin/stats');
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

function formatBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return '-';
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)} TB`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${(n / 1e3).toFixed(0)} KB`;
}

function statusBadge(status: string, error: string | null): string {
  if (status === 'failed') {
    return `<span class="px-2.5 py-0.5 bg-red-50 text-red-700 rounded-full text-xs font-medium">Failed</span>${
      error ? `<div class="text-xs text-red-500 mt-1 max-w-xs">${escapeHtml(error)}</div>` : ''
    }`;
  }
  if (status === 'started') {
    return '<span class="px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium">In progress</span>';
  }
  return '<span class="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">Success</span>';
}

function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function renderDashboard(
  data: ReturnType<typeof getDownloadsInRange>,
  username: string,
  from: string,
  to: string,
  today: string,
  status: StatusFilter,
): string {
  const visible = status === 'all' ? data.rows : data.rows.filter((d) => d.status === status);
  const statusOptions = (
    [
      ['all', 'All'],
      ['success', 'Success'],
      ['failed', 'Failed'],
      ['started', 'In progress'],
    ] as Array<[StatusFilter, string]>
  )
    .map(([v, label]) => `<option value="${v}"${v === status ? ' selected' : ''}>${label}</option>`)
    .join('');
  const statusParam = status === 'all' ? '' : `&status=${status}`;
  const presets: Array<[string, string, string]> = [
    ['Today', today, today],
    ['Yesterday', addDays(today, -1), addDays(today, -1)],
    ['Last 7 days', addDays(today, -6), today],
    ['Last 30 days', addDays(today, -29), today],
    ['This month', `${today.slice(0, 8)}01`, today],
    ['All time', '2020-01-01', today],
  ];
  const presetLinks = presets
    .map(([label, f, t]) => {
      const active = f === from && t === to;
      return `<a href="/admin/stats?from=${f}&to=${t}${statusParam}" class="px-3 py-1.5 rounded-full text-sm border ${
        active ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-300 hover:bg-slate-50'
      }">${label}</a>`;
    })
    .join('');

  const byPlatform = data.platforms
    .map(
      (p) => `
      <div class="flex justify-between items-center py-2 border-b border-slate-100 last:border-none">
        <span class="font-medium">${escapeHtml(p.platform)}</span>
        <span class="font-mono text-lg">${p.count} <span class="text-sm text-slate-400">· ${formatBytes(p.bytes)}</span></span>
      </div>`,
    )
    .join('');

  const rows = visible
    .map(
      (d) => `
      <tr>
        <td class="py-2.5 px-4 text-slate-600 whitespace-nowrap">${timeFmt.format(new Date(d.timestamp))}</td>
        <td class="py-2.5 px-4"><span class="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">${escapeHtml(d.platform)}</span></td>
        <td class="py-2.5 px-4 font-mono">${escapeHtml(d.quality)}</td>
        <td class="py-2.5 px-4 text-center">${d.output_height ? `${d.output_height}p` : '-'}</td>
        <td class="py-2.5 px-4 text-right font-mono">${formatBytes(d.bytes)}</td>
        <td class="py-2.5 px-4">${statusBadge(d.status, d.error)}</td>
        <td class="py-2.5 px-4 text-center text-emerald-600">${escapeHtml(d.country || '-')}</td>
        <td class="py-2.5 px-4 font-mono text-xs text-slate-500">${escapeHtml(d.ip || '-')}</td>
      </tr>`,
    )
    .join('');

  const rangeLabel = from === to ? from : `${from} → ${to}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VidCliply • Admin Stats</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-100 text-slate-900">
  <div class="max-w-6xl mx-auto p-4 sm:p-6">
    <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
      <div class="flex items-center gap-4">
        <div class="w-11 h-11 bg-white shadow border rounded-2xl flex items-center justify-center">
          <span class="text-2xl font-bold text-slate-900">V</span>
        </div>
        <div>
          <h1 class="text-3xl font-bold text-slate-900">VidCliply Admin</h1>
          <p class="text-slate-500 text-sm">Welcome back, <span class="font-medium text-slate-900">${escapeHtml(username)}</span> · times in Poland (Europe/Warsaw)</p>
        </div>
      </div>
      <form method="POST" action="/admin/stats/logout">
        <button class="px-4 py-2 text-sm bg-white border border-slate-300 hover:bg-slate-50 rounded-2xl">Log out</button>
      </form>
    </div>

    <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-5 mb-6">
      <form method="GET" action="/admin/stats" class="flex flex-wrap items-end gap-3">
        <label class="text-sm text-slate-500">From<br>
          <input type="date" name="from" value="${from}" class="mt-1 border border-slate-300 rounded-xl px-3 py-2 text-slate-900">
        </label>
        <label class="text-sm text-slate-500">To<br>
          <input type="date" name="to" value="${to}" class="mt-1 border border-slate-300 rounded-xl px-3 py-2 text-slate-900">
        </label>
        <label class="text-sm text-slate-500">Status<br>
          <select name="status" class="mt-1 border border-slate-300 rounded-xl px-3 py-2 text-slate-900 bg-white">${statusOptions}</select>
        </label>
        <button class="px-5 py-2.5 bg-slate-900 hover:bg-black text-white rounded-xl font-medium">Show</button>
      </form>
      <div class="flex flex-wrap gap-2 mt-4">${presetLinks}</div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-6">
        <div class="text-sm text-slate-500 mb-1">Downloads · ${rangeLabel}</div>
        <div class="text-5xl font-bold text-slate-900">${data.count.toLocaleString()}</div>
        <div class="text-sm mt-2 ${data.failed ? 'text-red-600' : 'text-slate-500'}">Failed: <span class="font-semibold">${data.failed.toLocaleString()}</span></div>
      </div>
      <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-6">
        <div class="text-sm text-slate-500 mb-1">Data used · ${rangeLabel}</div>
        <div class="text-5xl font-bold text-emerald-600">${formatBytes(data.bytes)}</div>
        <div class="text-sm text-slate-500 mt-2">${data.count ? `avg ${formatBytes(data.bytes / data.count)} per download` : ''}</div>
      </div>
      <div class="bg-white border border-slate-200 shadow-sm rounded-3xl p-6">
        <div class="text-sm text-slate-500 mb-3">By Platform</div>
        <div class="space-y-1 text-sm">${byPlatform || '<div class="text-slate-400 py-4">No data</div>'}</div>
      </div>
    </div>

    <div class="bg-white border border-slate-200 shadow-sm rounded-3xl overflow-hidden">
      <div class="px-6 py-4 border-b border-slate-100">
        <h2 class="font-semibold text-lg text-slate-900">All downloads <span class="text-sm text-slate-400 font-normal">(${visible.length.toLocaleString()} shown)</span></h2>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-slate-50 text-left">
              <th class="py-3 px-4 font-medium text-slate-500">Time (Poland)</th>
              <th class="py-3 px-4 font-medium text-slate-500">Platform</th>
              <th class="py-3 px-4 font-medium text-slate-500">Quality</th>
              <th class="py-3 px-4 text-center font-medium text-slate-500">Resolution</th>
              <th class="py-3 px-4 text-right font-medium text-slate-500">Size</th>
              <th class="py-3 px-4 font-medium text-slate-500">Status</th>
              <th class="py-3 px-4 text-center font-medium text-slate-500">Country</th>
              <th class="py-3 px-4 font-medium text-slate-500">IP</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${rows || '<tr><td colspan="8" class="py-10 text-center text-slate-400">No downloads for this filter</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export default router;
