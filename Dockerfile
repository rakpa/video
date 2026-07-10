# VidCliply — full-stack image (Node API + yt-dlp + ffmpeg + built React UI)
FROM node:20-bookworm-slim

# yt-dlp is installed via pip (python module) rather than the release binary:
# the standalone binary unpacks itself on every invocation (adds seconds to each
# download's startup), whereas the pip module starts almost instantly. Bump this
# token to bust Docker's layer cache and reinstall the latest yt-dlp (which also
# carries the newest YouTube fixes). See https://github.com/yt-dlp/yt-dlp/releases
ARG YTDLP_VERSION=2026.06.19

# System deps: ffmpeg (merge), python3 + pip (run yt-dlp), git (PO-token provider).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 python3-pip git \
  && echo "yt-dlp build token: ${YTDLP_VERSION}" \
  && pip3 install --break-system-packages --no-cache-dir -U yt-dlp \
  && yt-dlp --version \
  && rm -rf /var/lib/apt/lists/*

# yt-dlp PO-token provider PLUGIN (lightweight — just Python files, no runtime
# memory cost). It activates only when YTDLP_POT_BASE_URL points at a running
# bgutil provider service (deploy that as a SEPARATE service); until then it's a
# harmless no-op. Best-effort so it can never break the build. This is the piece
# that fixes the intermittent "Sign in to confirm you're not a bot" errors.
RUN pip3 install --break-system-packages --no-cache-dir bgutil-ytdlp-pot-provider \
  || echo "WARN: PO-token plugin not installed; downloads still work without it"

# --- BgUtils PO Token provider (OPTIONAL — OFF by default) ---
# Only needed to bypass YouTube bot-detection WITHOUT a proxy. If you use
# YTDLP_PROXY (recommended), leave this disabled: running the provider is a
# second Node process that adds memory pressure and can OOM-crash the 512 MB
# free tier. Enable with: --build-arg ENABLE_POT_PROVIDER=true
ARG ENABLE_POT_PROVIDER=false
RUN if [ "$ENABLE_POT_PROVIDER" = "true" ]; then \
      ( git clone --single-branch --branch 1.3.1 \
          https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil \
        && cd /opt/bgutil/server && npm ci --include=dev && npx tsc \
        && mkdir -p /root/.config/yt-dlp/plugins \
        && cp -r /opt/bgutil/plugin/yt_dlp_plugins /root/.config/yt-dlp/plugins/ \
        && echo "PO token provider installed" ) \
      || echo "WARN: PO token provider setup failed; continuing without it" ; \
    else echo "PO token provider disabled (set ENABLE_POT_PROVIDER=true to enable)"; fi

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/

# Temporarily using npm install instead of npm ci to fix lock file sync issue
RUN npm install --prefix client --include=dev \
  && npm install --prefix server --include=dev

COPY client ./client
COPY server ./server

RUN npm run build --prefix client && npm run build --prefix server

# Entrypoint starts the PO token provider (only if it was built) then the API.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV SERVE_CLIENT=true
ENV PORT=10000
ENV YTDLP_PATH=yt-dlp
ENV FFMPEG_PATH=ffmpeg
ENV LOW_MEMORY_MODE=false
ENV NODE_OPTIONS=--max-old-space-size=384

EXPOSE 10000

# Use sh explicitly to avoid permission issues on Railway
CMD ["sh", "/usr/local/bin/docker-entrypoint.sh"]
