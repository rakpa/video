#!/bin/sh
# Start the BgUtils PO token provider in the background (best-effort: if it isn't
# present or fails, yt-dlp simply proceeds without it). It listens on 127.0.0.1:4416,
# which the yt-dlp plugin auto-discovers.
if [ -f /opt/bgutil/server/build/main.js ]; then
  node /opt/bgutil/server/build/main.js >/tmp/bgutil-provider.log 2>&1 &
  echo "Started PO token provider on :4416"
fi

# Hand off to the API server (PID 1 so signals/shutdown work correctly).
exec node server/dist/index.js
