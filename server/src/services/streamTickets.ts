import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import type { StreamMergeSelection } from './ytdlp.js';
import type { ClipRange } from '../utils/clip.js';

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
  /** Optional trim range — ffmpeg -ss/-t while remuxing (YouTube clips). */
  clip: ClipRange | null;
  /**
   * Instagram sources are often 720p while the user picked HD/Full HD. When set,
   * the stream re-encodes with a Lanczos upscale + light sharpen to this short-side
   * height (1080) instead of a plain copy-remux.
   */
  enhanceTo: number | null;
  /**
   * Expected download size for Content-Length (browser download progress).
   * Prefer CDN-probed totals; falls back to yt-dlp format sizes.
   */
  contentLength: number | null;
  createdAt: number;
  /**
   * Concurrency slot reserved at ticket creation so POST→GET cannot race into
   * a 503 (that used to bounce clients into fragile iframe fallbacks).
   */
  slotHeld: boolean;
  /** True while a GET /api/stream is actively piping bytes for this ticket. */
  transferActive: boolean;
}

/** Google CDN URLs expire after ~6h, but keep tickets short — a retry re-POSTs. */
const TICKET_TTL_MS = 15 * 60_000;

const tickets = new Map<string, StreamTicket>();

function sweep(): void {
  const now = Date.now();
  for (const [id, t] of tickets) {
    if (now - t.createdAt > TICKET_TTL_MS) {
      releaseTicketSlot(t);
      tickets.delete(id);
    }
  }
}

function initialContentLength(
  selection: StreamMergeSelection,
  clip: ClipRange | null,
): number | null {
  const base = selection.estimatedBytes;
  if (base == null || base <= 0) return null;
  if (!clip || !(clip.endTime > clip.startTime)) return base;
  const duration = selection.durationSeconds;
  if (duration == null || duration <= 0) return null;
  const ratio = Math.min(1, Math.max(0.01, (clip.endTime - clip.startTime) / duration));
  return Math.max(1, Math.round(base * ratio));
}

export function createStreamTicket(
  selection: StreamMergeSelection,
  filename: string,
  sourceUrl: string,
  proxy: string,
  clip: ClipRange | null = null,
  enhanceTo: number | null = null,
): StreamTicket | null {
  sweep();
  if (!acquireStreamSlot()) return null;
  const ticket: StreamTicket = {
    id: randomUUID(),
    selection,
    filename,
    sourceUrl,
    proxy,
    clip,
    enhanceTo,
    // A re-encode has no predictable size — don't promise a wrong Content-Length.
    contentLength: enhanceTo ? null : initialContentLength(selection, clip),
    createdAt: Date.now(),
    slotHeld: true,
    transferActive: false,
  };
  tickets.set(ticket.id, ticket);
  return ticket;
}

/** Update Content-Length after a CDN Range probe (more accurate than yt-dlp estimates). */
export function setStreamTicketContentLength(id: string, bytes: number): void {
  const t = tickets.get(id);
  if (!t || !(bytes > 0)) return;
  t.contentLength = Math.round(bytes);
}

export function getStreamTicket(id: string): StreamTicket | null {
  const t = tickets.get(id);
  if (!t) return null;
  if (Date.now() - t.createdAt > TICKET_TTL_MS) {
    releaseTicketSlot(t);
    tickets.delete(id);
    return null;
  }
  return t;
}

/** Mark a transfer in progress — second concurrent GET on the same ticket is rejected. */
export function beginTicketTransfer(ticket: StreamTicket): boolean {
  if (ticket.transferActive) return false;
  // After a finished/failed transfer the slot is released so the same ticket can
  // be retried; re-acquire then, using the same hard capacity limit as POST.
  if (!ticket.slotHeld) {
    if (!acquireStreamSlot()) return false;
    ticket.slotHeld = true;
  }
  ticket.transferActive = true;
  return true;
}

export function endTicketTransfer(ticket: StreamTicket): void {
  ticket.transferActive = false;
  releaseTicketSlot(ticket);
}

export function releaseTicketSlot(ticket: StreamTicket): void {
  if (!ticket.slotHeld) return;
  ticket.slotHeld = false;
  releaseStreamSlot();
}

/* ------------------------- concurrency accounting ------------------------- */

let activeStreams = 0;

/** ffmpeg -c copy is network-bound like yt-dlp jobs, so share their budget. */
export function maxConcurrentStreams(): number {
  return Math.max(4, config.maxConcurrentJobs);
}

/** Checked at POST time so a saturated server falls back to the job pipeline. */
export function hasStreamCapacity(): boolean {
  return activeStreams < maxConcurrentStreams();
}

/** Hard cap — same limit as hasStreamCapacity (no soft/hard race). */
export function acquireStreamSlot(): boolean {
  if (activeStreams >= maxConcurrentStreams()) return false;
  activeStreams += 1;
  return true;
}

export function releaseStreamSlot(): void {
  activeStreams = Math.max(0, activeStreams - 1);
}
