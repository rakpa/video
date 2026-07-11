# Deployment Guide - VidCliply

**Latest Update**: Cambria font config has been added (`tailwind.config.cambria.ts`).

To activate Cambria font across the entire website:
1. Rename `client/tailwind.config.cambria.ts` → `client/tailwind.config.ts`
2. Redeploy on Vercel

All previous improvements (retry logic, better error messages, deployment docs) are also included.

---

## Backend Deployment (Render)

Deploy using the existing `render.yaml` blueprint.

## Frontend Environment Variable

Set `VITE_API_URL` in Vercel to your Render backend URL.

## Download-once cache (Cloudflare R2) — optional, recommended at scale

When these are set, every finished download is uploaded to the bucket and
repeat requests for the same video+quality are served instantly via presigned
URLs — one source download per viral video, and R2 charges **no egress**.
Leave unset to keep the original local-disk behavior.

| Variable | Value |
| --- | --- |
| `R2_ACCOUNT_ID` | Cloudflare account id (or set `R2_ENDPOINT` directly) |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | R2 API token pair |
| `R2_BUCKET` | Bucket name, e.g. `vidcliply-cache` |
| `R2_CACHE_TTL_HOURS` | Optional, default 24 — align with a bucket lifecycle rule that deletes objects after the same period |

Create the bucket with a lifecycle rule that expires objects after ~1 day so
storage stays small (the cache only needs to absorb traffic spikes).
