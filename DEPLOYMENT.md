# Deployment Guide - ClipVault (video repo)

This project uses a **split deployment**:
- **Frontend** → Vercel
- **Backend (API)** → Render (Docker)

---

## 1. Deploy the Backend on Render (Required First)

1. Go to [https://dashboard.render.com](https://dashboard.render.com)
2. Click **New +** → **Blueprint**
3. Connect your GitHub repository `rakpa/video`
4. Render will automatically detect the `render.yaml` file
5. Click **Deploy**

After deployment completes:
- Copy the **public URL** of the service (e.g. `https://clipvault-api-abc123.onrender.com`)
- Note: Free tier services sleep after ~15 minutes of inactivity

### Test the Backend

Open this URL in your browser:
```
https://clipvault-api-xxx.onrender.com/api/health
```

You should see something like:
```json
{ "status": "ok" }
```

---

## 2. Configure Vercel Frontend

1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add the following variable:

| Name            | Value                                      | Environment |
|-----------------|--------------------------------------------|-------------|
| `VITE_API_URL`  | `https://clipvault-api-xxx.onrender.com`   | Production  |

> **Important**: Do **not** add a trailing slash at the end.

4. Save the variable
5. Redeploy your frontend (or push any commit to trigger deployment)

---

## 3. Common Issues & Fixes

### "Could not reach the download service"

This is normal on the first request after the backend sleeps (Render free tier).

**Fixes:**
- Wait 30–60 seconds and try again
- The latest code includes better messaging and will improve with retries in future updates
- Make sure `VITE_API_URL` is correctly set on Vercel

### CORS Errors

Make sure the `CLIENT_ORIGIN` in `render.yaml` matches your Vercel domain:
```yaml
- key: CLIENT_ORIGIN
  value: https://video-beige-five.vercel.app
```

### Health Check Failing

Check the Render logs for startup errors (usually missing environment variables or yt-dlp issues).

---

## 4. Alternative: Unified Deployment (Optional)

If you prefer everything on one platform, you can deploy the full Docker image on Render with `SERVE_CLIENT=true`. This serves both frontend and backend from the same URL.

Just set these env vars on Render:
```yaml
- key: SERVE_CLIENT
  value: 'true'
- key: VITE_API_URL   # leave empty or remove
```

---

## Need Help?

If you're still seeing issues after following these steps, share:
- The Render service URL
- Screenshot of Vercel environment variables
- Any error from the browser console

We'll debug it together.
