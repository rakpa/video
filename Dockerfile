# ClipVault — full-stack image (Node API + yt-dlp + ffmpeg + built React UI)
FROM node:20-bookworm-slim

# Pin yt-dlp to a known-good release. Bump this to upgrade — changing the value
# also busts Docker's layer cache so Render actually fetches the new binary
# instead of silently reusing a stale cached "latest" (which crashes on finalize
# as YouTube changes). See https://github.com/yt-dlp/yt-dlp/releases
ARG YTDLP_VERSION=2026.06.09

# System deps: ffmpeg (merge), yt-dlp (download), python3 (yt-dlp runtime),
# git (clone + build the PO-token provider).
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 git \
  && curl -L "https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp" -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

# --- BgUtils PO Token provider (helps bypass YouTube bot detection) ---
# Builds the provider server (runs locally on :4416) and installs the yt-dlp
# plugin so yt-dlp auto-fetches the poToken / visitor_data YouTube now requires
# (this is the equivalent of Cobalt's YOUTUBE_SESSION_SERVER). Pinned to a known
# tag and made best-effort: a failure here must never break the image build.
RUN ( git clone --single-branch --branch 1.3.1 \
        https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /opt/bgutil \
      && cd /opt/bgutil/server && npm ci --include=dev && npx tsc \
      && mkdir -p /root/.config/yt-dlp/plugins \
      && cp -r /opt/bgutil/plugin/yt_dlp_plugins /root/.config/yt-dlp/plugins/ \
      && echo "PO token provider installed" ) \
   || echo "WARN: PO token provider setup failed; continuing without it"

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/

RUN npm ci --prefix client --include=dev \
  && npm ci --prefix server --include=dev

COPY client ./client
COPY server ./server

RUN npm run build --prefix client && npm run build --prefix server

# Entrypoint starts the PO token provider (background) then the API.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV SERVE_CLIENT=true
ENV PORT=10000
ENV YTDLP_PATH=yt-dlp
ENV FFMPEG_PATH=ffmpeg

EXPOSE 10000

CMD ["docker-entrypoint.sh"]
