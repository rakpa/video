# ClipVault — full-stack image (Node API + yt-dlp + ffmpeg + built React UI)
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl python3 \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
COPY client/package.json client/package-lock.json ./client/
COPY server/package.json server/package-lock.json ./server/

RUN npm ci --prefix client --include=dev \
  && npm ci --prefix server --include=dev

COPY client ./client
COPY server ./server

RUN npm run build --prefix client && npm run build --prefix server

ENV NODE_ENV=production
ENV SERVE_CLIENT=true
ENV PORT=10000
ENV YTDLP_PATH=yt-dlp
ENV FFMPEG_PATH=ffmpeg

EXPOSE 10000

CMD ["node", "server/dist/index.js"]
