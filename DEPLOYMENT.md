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
