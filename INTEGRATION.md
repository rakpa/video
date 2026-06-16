# Integration Guide - Improved API Client

I've created a better version of the API client with automatic retry support.

## Files Created

- `client/src/api/client.improved.ts` — Full improved client (recommended)
- `client/src/utils/retryFetch.ts` — Reusable retry utility

## How to Activate (Minimal Change)

### Option 1: Quick Swap (Recommended)

1. Rename current file:
   ```
   client/src/api/client.ts  →  client/src/api/client.old.ts
   ```
2. Rename improved file:
   ```
   client/src/api/client.improved.ts  →  client/src/api/client.ts
   ```
3. Commit & push (or let Vercel auto-deploy)

### Option 2: Keep Both

Import from the improved file where needed:
```ts
import { fetchVideoInfo, fetchVideoPreview } from './client.improved';
```

## What the Improvement Does

- Automatically retries failed API calls (up to 4 times)
- Uses exponential backoff (better for sleeping free-tier backends like Render)
- Much better UX on production — less "Could not reach the download service" errors

## After Switching

Push the changes. Vercel should automatically create a new deployment if auto-deploy is enabled.

If not, manually redeploy from the Vercel dashboard.
