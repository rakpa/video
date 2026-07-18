# Deployment Guide - VidCliply

**Latest Update**: Cambria font config has been added (`tailwind.config.cambria.ts`).

To activate Cambria font across the entire website:
1. Rename `client/tailwind.config.cambria.ts` → `client/tailwind.config.ts`
2. Redeploy on Vercel

All previous improvements (retry logic, better error messages, deployment docs) are also included.

---

## Backend Deployment (Railway)

Connect this repo to a Railway service (root directory = repo root; it builds
from the `Dockerfile` per `railway.toml`). Railway auto-deploys on every push
to the connected branch (`main`). See `railway.toml` for optional tuning env
vars (worker slots, Redis for the durable 2K/4K quota, `YTDLP_PROXY`, …).

## Frontend Environment Variable

Set `VITE_API_URL` in Vercel to your Railway backend URL (no trailing slash),
and set `CLIENT_ORIGIN` on Railway to your exact Vercel domain(s) for CORS.
