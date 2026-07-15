/**
 * Fast YouTube duration via the IFrame Player API (browser-side).
 * oEmbed has no duration; /api/info arrives ~4s later — this fills clip "To"
 * as soon as the thumbnail card is up.
 */

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        options: {
          videoId: string;
          width?: number;
          height?: number;
          playerVars?: Record<string, number | string>;
          events?: {
            onReady?: (e: { target: YtPlayerLike }) => void;
            onError?: () => void;
            onStateChange?: (e: { data: number; target: YtPlayerLike }) => void;
          };
        },
      ) => YtPlayerLike;
      PlayerState?: { CUED: number; PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YtPlayerLike {
  getDuration: () => number;
  destroy: () => void;
}

let apiLoad: Promise<void> | null = null;

function loadYoutubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT?.Player) return Promise.resolve();
  if (apiLoad) return apiLoad;

  apiLoad = new Promise((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      try {
        prev?.();
      } catch {
        /* ignore prior handler errors */
      }
      resolve();
    };
    if (!document.querySelector('script[data-vidcliply-yt-api]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.dataset.vidcliplyYtApi = '1';
      document.head.appendChild(s);
    }
    // Already mid-load when this module is re-imported.
    if (window.YT?.Player) resolve();
  });
  return apiLoad;
}

/**
 * Resolve video length in seconds (integer), or null on timeout/error.
 * Uses a 0×0 offscreen player so metadata loads without visible UI.
 */
export async function fetchYoutubeDurationSeconds(
  videoId: string,
  timeoutMs = 6000,
): Promise<number | null> {
  if (!videoId || typeof document === 'undefined') return null;

  try {
    await Promise.race([
      loadYoutubeIframeApi(),
      new Promise<void>((_, reject) => {
        window.setTimeout(() => reject(new Error('iframe api timeout')), timeoutMs);
      }),
    ]);
  } catch {
    return null;
  }

  if (!window.YT?.Player) return null;

  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    host.style.cssText =
      'position:absolute;width:1px;height:1px;left:-9999px;top:0;overflow:hidden;opacity:0;pointer-events:none';
    document.body.appendChild(host);

    let settled = false;
    let player: YtPlayerLike | null = null;
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      try {
        player?.destroy();
      } catch {
        /* already destroyed */
      }
      host.remove();
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    let poll = 0;

    const takeDuration = (target: YtPlayerLike) => {
      try {
        const d = target.getDuration();
        if (typeof d === 'number' && Number.isFinite(d) && d > 0) {
          finish(Math.round(d));
          return true;
        }
      } catch {
        /* player not ready */
      }
      return false;
    };

    const YT = window.YT;
    if (!YT?.Player) {
      finish(null);
      return;
    }

    try {
      player = new YT.Player(host, {
        videoId,
        width: 1,
        height: 1,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: (e) => {
            if (takeDuration(e.target)) return;
            // Duration is often 0 until metadata lands — poll briefly.
            poll = window.setInterval(() => {
              if (player && takeDuration(player)) return;
            }, 150);
          },
          onStateChange: (e) => {
            takeDuration(e.target);
          },
          onError: () => finish(null),
        },
      });
    } catch {
      finish(null);
    }
  });
}
