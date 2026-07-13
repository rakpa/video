import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type { StreamMergeSelection } from './ytdlp.js';

/**
 * Short-lived tickets for /api/stream. POST /api/download resolves the CDN
 * format URLs, stores them here and hands the browser an opaque ticket URL —
 * the raw googlevideo URLs never leave the server, and the GET can be retried
 * (browser download restart) while the ticket is fresh.
 */
export interface StreamTicket {
  id: string;
  selection: StreamMergeSelection;
  filename: string;
  sourceUrl: string;
  /** Proxy URL that extracted the CDN URLs ('' = none) — relay fetches must use it. */
  proxy: string;
  createdAt: number;
}

/** Google CDN URLs expire after ~6h, but keep tickets short — a retry re-POSTs. */
const TICKET_TTL_MS = 15 * 60_000;

const tickets = new Map<string, StreamTicket>();

function sweep(): void {
  const now = Date.now();
  for (const [id, t] of tickets) {
    if (now - t.createdAt > TICKET_TTL_MS) tickets.delete(id);
  }
}

export function createStreamTicket(
  selection: StreamMergeSelection,
  filename: string,
  sourceUrl: string,
  proxy: string,
): StreamTicket {
  sweep();
  const ticket: StreamTicket = {
    id: randomUUID(),
    selection,
    filename,
    sourceUrl,
    proxy,
    createdAt: Date.now(),
  };
  tickets.set(ticket.id, ticket);
  return ticket;
}

export function getStreamTicket(id: string): StreamTicket | null {
  const t = tickets.get(id);
  if (!t) return null;
  if (Date.now() - t.createdAt > TICKET_TTL_MS) {
    tickets.delete(id);
    return null;
  }
  return t;
}

/* ------------------------- concurrency accounting ------------------------- */

let activeStreams = 0;

/** ffmpeg -c copy is network-bound like yt-dlp jobs, so share their budget. */
export function maxConcurrentStreams(): number {
  return Math.max(4, config.maxConcurrentJobs);
}

/** Checked at POST time so a saturated server falls back to the job queue. */
export function hasStreamCapacity(): boolean {
  return activeStreams < maxConcurrentStreams();
}

/** Hard cap at GET time — allows brief overshoot for retried downloads. */
export function acquireStreamSlot(): boolean {
  if (activeStreams >= maxConcurrentStreams() * 2) return false;
  activeStreams += 1;
  return true;
}

export function releaseStreamSlot(): void {
  activeStreams = Math.max(0, activeStreams - 1);
}
