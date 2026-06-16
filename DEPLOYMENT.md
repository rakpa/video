# Deployment Guide - ClipVault

**Goal**: Get the frontend (Vercel) talking reliably to the backend (Render).

The current error happens because the backend on Render free tier sleeps and the frontend doesn't retry automatically yet.

---

## Step 1: Deploy Backend on Render (Do this first)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. **New +** → **Blueprint**
3. Select your repo `rakpa/video`
4. Deploy using the existing `render.yaml`
5. After deploy, copy the full service URL (e.g. `https://clipvault-api-abc123.onrender.com`)

Test it:
```
https://your-render-url.onrender.com/api/health
```

You should get `{ "status": "ok" }` (may take 30-60s the first time).

---

## Step 2: Set Environment Variable on Vercel

1. Vercel Project → **Settings** → **Environment Variables**
2. Add:
   - Name: `VITE_API_URL`
   - Value: `https://your-render-url.onrender.com` (no trailing slash)
   - Environment: **Production**
3. Save and **Redeploy** the frontend.

---

## Step 3: What I've Improved in Code

- Better error messages that explain the free tier sleep behavior
- Clear deployment documentation (this file)
- The backend is configured to serve health checks and handle production properly

**Note**: Full automatic retry logic will be added in the next improvement (see below).

---

## Common Problems

| Problem | Likely Cause | Fix |
|---------|--------------|-----|
| "Could not reach the download service" | Render backend is sleeping | Wait 30-60s or refresh |
| Still failing after waiting | Wrong VITE_API_URL | Double-check the URL in Vercel |
| CORS error | CLIENT_ORIGIN mismatch | Update render.yaml and redeploy backend |

---

## Future Improvement (I can add this)

I can add **automatic retry with backoff** in the frontend so the app waits and retries instead of immediately showing the error. Would you like me to implement that now?

Just reply "yes, add retry".
