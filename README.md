# 🎬 ClipVault — Premium Video Downloader

A polished, production-ready web app to download videos from **YouTube, Facebook, and Instagram** by pasting a URL. Choose **720p · 1080p · 2K · 4K** — always merged to a single **MP4 with sound**.

> Built with React + TypeScript + Tailwind + Framer Motion on the front, Node + Express + `yt-dlp` + `ffmpeg` on the back.

---

## ☁️ Deploy (frontend on Vercel + backend on Render)

This app has **two halves**: a static **frontend** (Vercel) and a **download backend** that runs `yt-dlp` + `ffmpeg` (must run on a real server — **not** Vercel). The backend is pre-configured for Render via `render.yaml`.

### 1. Deploy the backend to Render (one click)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/rakpa/video)

This reads `render.yaml`, creates the `clipvault-api` Web Service (Docker, Free plan), and installs `ffmpeg` + `yt-dlp` from the `Dockerfile`. Auto-deploys on every push to the connected branch. Copy the URL it gives you (e.g. `https://clipvault-api-xxxx.onrender.com`).

> Free tier sleeps after ~15 min idle; the first request then takes ~50s to wake — that's the "wait a minute for the API to wake up" notice in the UI.

### 2. Point the frontend at it (Vercel)

1. Vercel → project → **Settings → Environment Variables** → set `VITE_API_URL` to your Render URL (no trailing slash).
2. **Redeploy** on Vercel (Vite bakes env vars in at build time).
3. On Render, ensure `CLIENT_ORIGIN` equals your exact Vercel domain (else CORS blocks requests).

---

## ✨ Features

- Paste-a-URL flow with **auto platform detection** (icon appears as you type).
- Rich metadata preview: thumbnail, title, duration, channel/author.
- Quality cards (720p/1080p/1440p/2160p) with **estimated file size** + **"with sound"** badge.
- **Codec toggle** — *Best quality* (VP9/AV1, up to 4K, smaller files) or *Most compatible* (H.264/AAC, capped at 1080p, plays in any player including older QuickTime/Windows Media Player).
- **Real-time progress** (percentage + speed + ETA) over Server-Sent Events.
- Glassmorphism UI, dark mode default + light toggle, confetti on success.
- Friendly error states for every failure (invalid URL, unsupported, no formats, network).
- Temp files are streamed and **deleted after each download** — nothing is stored permanently.

---

## 📦 Prerequisites — install the binaries

This app shells out to two external binaries. **Both must be on your `PATH`.**

### 1. `yt-dlp`

| OS | Command |
|----|---------|
| Windows (winget) | `winget install yt-dlp.yt-dlp` |
| Windows (choco) | `choco install yt-dlp` |
| macOS | `brew install yt-dlp` |
| Linux | `sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod a+rx /usr/local/bin/yt-dlp` |
| pip (any) | `pip install -U yt-dlp` |

### 2. `ffmpeg` (required to merge video + audio)

| OS | Command |
|----|---------|
| Windows (winget) | `winget install Gyan.FFmpeg` |
| Windows (choco) | `choco install ffmpeg` |
| macOS | `brew install ffmpeg` |
| Linux (Debian/Ubuntu) | `sudo apt install ffmpeg` |

**Verify both are visible:**

```bash
yt-dlp --version
ffmpeg -version
```

> If they live in a custom folder, set `YTDLP_PATH` and `FFMPEG_PATH` in `server/.env` (see below).

---

## 🚀 Run it (dev)

Open two terminals.

```bash
# Terminal 1 — backend (http://localhost:5174)
cd server
cp .env.example .env       # Windows PowerShell: copy .env.example .env
npm install
npm run dev

# Terminal 2 — frontend (http://localhost:5173)
cd client
npm install
npm run dev
```

Visit **http://localhost:5173**. The Vite dev server proxies `/api` to the backend automatically.

---

## 🔧 Environment variables (`server/.env`)

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `5174` | Backend port. |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed CORS origin. |
| `YTDLP_PATH` | `yt-dlp` | Path to the yt-dlp binary (override if not on PATH). |
| `FFMPEG_PATH` | `ffmpeg` | Path to the ffmpeg binary (override if not on PATH). |
| `TMP_TTL_MINUTES` | `30` | How long a finished temp file lives before the sweeper deletes it. |
| `MAX_DURATION_MINUTES` | `180` | Reject videos longer than this (abuse guard). |

---

## 🏗️ Production build

```bash
# Build frontend → static files in client/dist
cd client && npm run build

# Build + run backend
cd ../server && npm run build && npm start
```

Serve `client/dist` from any static host (or have the backend serve it) and point its `/api` calls at the backend URL.

---

## 🧱 Extending to new platforms

Platform support lives in **one place per side**:

- Frontend: `client/src/utils/platform.ts` → add a `{ id, label, test, icon }` entry.
- Backend: `server/src/services/platform.ts` → add a matching detector.

`yt-dlp` already supports 1000+ sites, so usually you only need to whitelist the URL pattern.

---

## ⚖️ Legal / Disclaimer

This tool is provided for downloading content **you own or have explicit rights to**. You are responsible for complying with each platform's Terms of Service and with applicable copyright law. The authors assume no liability for misuse.

---

## 📁 Project structure

```
video-downloader/
├── README.md
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── .env.example
│   └── src/
│       ├── index.ts              # Express app + routes wiring
│       ├── config.ts             # env config
│       ├── jobManager.ts         # in-memory job store + TTL sweeper
│       ├── routes/
│       │   ├── info.ts           # POST /api/info
│       │   ├── download.ts       # POST /api/download
│       │   ├── progress.ts       # GET  /api/progress/:jobId (SSE)
│       │   └── file.ts           # GET  /api/file/:jobId (stream + cleanup)
│       ├── services/
│       │   ├── platform.ts       # URL → platform detection
│       │   ├── ytdlp.ts          # spawn yt-dlp (info + download)
│       │   └── formats.ts        # quality → yt-dlp format selectors
│       └── utils/
│           ├── validate.ts       # URL validation
│           └── logger.ts
└── client/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── index.css
        ├── types.ts
        ├── api/client.ts
        ├── hooks/useTheme.ts
        ├── utils/platform.ts
        ├── utils/format.ts
        └── components/
            ├── Hero.tsx
            ├── UrlInput.tsx
            ├── PlatformIcon.tsx
            ├── VideoPreview.tsx
            ├── QualitySelector.tsx
            ├── DownloadProgress.tsx
            ├── SuccessState.tsx
            ├── ErrorBanner.tsx
            ├── ThemeToggle.tsx
            ├── Confetti.tsx
            └── Footer.tsx
```
