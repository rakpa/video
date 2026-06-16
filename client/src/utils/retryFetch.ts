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

      // If we get a response (even error status), return it
      // Only retry on network-level failures
      if (res.ok || res.status < 500) {
        return res;
      }

      // For 5xx errors, we can retry
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
