import { fetch as undiciFetch, Agent, ProxyAgent, type Dispatcher, type RequestInit as UndiciInit, type Response as UndiciResponse } from 'undici';
import { currentProxy } from '../config.js';

/** One dispatcher per proxy URL — ProxyAgent holds a reusable connection pool. */
const dispatchers = new Map<string, Dispatcher>();

function dispatcherFor(proxy: string | undefined): Dispatcher {
  const key = proxy ?? '';
  let d = dispatchers.get(key);
  if (!d) {
    const pool = {
      connections: 4,
      pipelining: 1,
      keepAliveTimeout: 15_000,
      keepAliveMaxTimeout: 30_000,
    };
    d = proxy
      ? (new (ProxyAgent as unknown as new (u: string, opts?: object) => Dispatcher)(proxy, pool))
      : new Agent(pool);
    dispatchers.set(key, d);
  }
  return d;
}

export type ProxyFetchInit = Omit<UndiciInit, 'dispatcher' | 'signal'> & {
  /** Abort after this many ms (default 5000). */
  timeoutMs?: number;
  signal?: AbortSignal;
  /** When true, use the sticky yt-dlp residential proxy (Instagram/FB scrape). */
  viaProxy?: boolean;
};

/**
 * Fetch that can route through the same residential proxy pool as yt-dlp.
 * Instagram oEmbed/OG from Render's datacenter IP hit login walls; the proxy
 * usually returns real JSON/HTML in a few hundred ms.
 */
export async function proxyFetch(url: string, init: ProxyFetchInit = {}): Promise<UndiciResponse> {
  const { timeoutMs = 5000, viaProxy = true, signal, ...rest } = init;
  const proxy = viaProxy ? currentProxy() : undefined;
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined =
    signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([signal, timeout])
      : timeout;

  return undiciFetch(url, {
    ...rest,
    dispatcher: dispatcherFor(proxy),
    signal: combined,
  });
}
