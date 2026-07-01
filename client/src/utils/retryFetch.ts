/**
 * Reliable fetch with retry and exponential backoff.
 * Especially useful for free-tier backends that sleep (Render, Railway, etc).
 */

export interface RetryOptions {
  retries?: number;
  delayMs?: number;
  backoffFactor?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  retries: 3,
  delayMs: 1500,
  backoffFactor: 1.8,
  onRetry: () => {},
};

export async function retryFetch(
  url: string,
  init?: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= opts.retries; attempt++) {
    try {
      const res = await fetch(url, init);

      // Only retry the gateway codes that signal a sleeping/booting free-tier
      // backend (Render cold start). A plain 500 is a real application error
      // (e.g. the video is unavailable or has no formats) — surface it
      // immediately instead of making the user wait through the full backoff.
      const isColdStart = res.status === 502 || res.status === 503 || res.status === 504;
      if (res.ok || !isColdStart) {
        return res;
      }

      // For cold-start gateway errors, we can retry
      if (attempt < opts.retries) {
        const delay = Math.floor(opts.delayMs * Math.pow(opts.backoffFactor, attempt - 1));
        opts.onRetry(attempt, new Error(`Server error ${res.status}`));
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      return res;
    } catch (err) {
      lastError = err as Error;

      if (attempt < opts.retries) {
        const delay = Math.floor(opts.delayMs * Math.pow(opts.backoffFactor, attempt - 1));
        opts.onRetry(attempt, lastError);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
    }
  }

  throw lastError || new Error('Failed to fetch after retries');
}
