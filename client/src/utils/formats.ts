import type { AvailableFormat } from '../types';

/** Shown instantly while yt-dlp computes real availability + file sizes. */
export const PLACEHOLDER_FORMATS: AvailableFormat[] = [
  { id: '720', label: '720p', tag: 'HD', height: 720, estimatedBytes: null, available: true, premium: false },
  { id: '1080', label: '1080p', tag: 'Full HD', height: 1080, estimatedBytes: null, available: true, premium: false },
  { id: '1440', label: '1440p', tag: '2K', height: 1440, estimatedBytes: null, available: true, premium: false },
  { id: '2160', label: '2160p', tag: '4K', height: 2160, estimatedBytes: null, available: true, premium: false },
];
