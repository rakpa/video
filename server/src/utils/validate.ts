import { detectPlatform } from '../services/platform.js';

export interface ValidationResult {
  ok: boolean;
  /** Human-friendly message when ok === false. */
  message?: string;
}

/** Validates that a string is a well-formed http(s) URL from a supported platform. */
export function validateUrl(raw: unknown): ValidationResult {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, message: 'Please paste a video URL.' };
  }

  const url = raw.trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: "That doesn't look like a valid link." };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, message: 'Only http and https links are supported.' };
  }

  if (!detectPlatform(url)) {
    return {
      ok: false,
      message: 'That site is not supported yet. Try a YouTube, Facebook, or Instagram link.',
    };
  }

  return { ok: true };
}
