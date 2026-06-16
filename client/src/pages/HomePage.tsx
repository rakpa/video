import { useCallback, useEffect, useRef } from 'react';
import { stitchPages } from '../content/stitchPages';
import { StitchHtmlPage } from '../components/StitchHtmlPage';
import type { DownloaderState } from '../hooks/useDownloader';
import { useDownloader } from '../hooks/useDownloader';
import { formatBytes, formatDuration } from '../utils/format';
import type { QualityId } from '../types';

const QUALITY_ORDER: QualityId[] = ['2160', '1080', '720'];

function formatQualityLabel(id: QualityId): string {
  if (id === '2160') return '2160p (Ultra HD)';
  if (id === '1080') return '1080p (Full HD)';
  if (id === '1440') return '1440p (2K)';
  return '720p (Standard HD)';
}

function formatQualityBadge(id: QualityId): string {
  if (id === '2160') return '4K';
  if (id === '1080') return 'HD';
  return 'HD';
}

function syncDom(root: HTMLElement, dl: DownloaderState) {
  const input = root.querySelector<HTMLInputElement>('[data-stitch="url-input"]');
  if (input && input.value !== dl.url) input.value = dl.url;

  const results = root.querySelector<HTMLElement>('[data-stitch="results"]');
  const showResults = dl.phase !== 'idle' && dl.info;
  if (results) {
    results.classList.toggle('hidden', !showResults);
  }

  if (!dl.info || !showResults) return;

  const img = results?.querySelector<HTMLImageElement>('img');
  if (img) {
    if (dl.info.thumbnail) img.src = dl.info.thumbnail;
    img.alt = dl.info.title;
  }

  const title = results?.querySelector('h2');
  if (title) title.textContent = dl.info.title;

  const durationEl = results?.querySelector('[data-icon="schedule"]')?.parentElement?.querySelector('span:last-child');
  if (durationEl) {
    durationEl.textContent = formatDuration(dl.info.durationSeconds) || '—';
  }

  const qualityEl = results?.querySelector('[data-icon="high_quality"]')?.parentElement?.querySelector('span:last-child');
  if (qualityEl) {
    const maxH = Math.max(...dl.info.formats.filter((f) => f.available).map((f) => f.height), 0);
    qualityEl.textContent = maxH >= 2160 ? 'Up to 4K' : maxH >= 1080 ? 'Up to 1080p' : 'Up to 720p';
  }

  const formatContainer = results?.querySelector<HTMLElement>('[data-stitch="format-list"]');
  if (!formatContainer) return;

  const available = QUALITY_ORDER.filter((id) => dl.info!.formats.some((f) => f.id === id && f.available));

  formatContainer.innerHTML = available
    .map((id) => {
      const fmt = dl.info!.formats.find((f) => f.id === id)!;
      const isActive = dl.phase === 'downloading' && dl.activeQuality === id;
      const isSuccess = dl.phase === 'success' && dl.activeQuality === id;
      const size = formatBytes(fmt.estimatedBytes);
      const badge =
        id === '2160'
          ? '<span class="bg-secondary-container text-on-secondary-container font-label-sm text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide">BEST QUALITY</span>'
          : id === '1080'
            ? '<span class="bg-surface-container-high text-on-surface-variant font-label-sm text-[10px] px-2 py-0.5 rounded-full">RECOMMENDED</span>'
            : '';

      if (isActive) {
        const pct = Math.round(dl.progress.percent);
        const circumference = 282.7;
        const offset = circumference - (pct / 100) * circumference;
        const stageLabel =
          dl.progress.stage === 'merging' ? 'Merging audio...' : dl.progress.stage === 'done' ? 'Complete' : 'Downloading video...';
        return `
        <div class="bg-surface border border-primary/50 rounded-lg p-stack-md flex flex-col hover:shadow-sm transition-all relative overflow-hidden shadow-sm" data-quality="${id}">
          <div class="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-stack-md ml-2">
              <div class="w-12 h-12 rounded-lg bg-primary-container flex items-center justify-center">
                <span class="font-title-lg text-title-lg text-on-primary-container font-bold">${formatQualityBadge(id)}</span>
              </div>
              <div>
                <div class="flex items-center gap-stack-sm">
                  <span class="font-label-md text-label-md text-on-surface font-semibold">${formatQualityLabel(id)}</span>
                  ${badge}
                </div>
                <span class="font-body-md text-body-md text-on-surface-variant text-sm mt-0.5 block">MP4 • ${size}</span>
              </div>
            </div>
          </div>
          <div class="ml-2 w-full bg-surface-container-low p-stack-sm rounded-lg border border-outline-variant/20 flex flex-col sm:flex-row items-center gap-4">
            <div class="relative w-16 h-16 shrink-0">
              <svg class="w-full h-full" viewBox="0 0 100 100">
                <circle class="text-surface-container-high stroke-current" cx="50" cy="50" fill="transparent" r="45" stroke-width="8"></circle>
                <circle class="text-primary stroke-current progress-ring" cx="50" cy="50" fill="transparent" r="45" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" stroke-width="8"></circle>
              </svg>
              <div class="absolute inset-0 flex items-center justify-center">
                <span class="font-label-sm text-label-sm text-primary font-bold">${pct}%</span>
              </div>
            </div>
            <div class="flex-grow w-full">
              <div class="flex items-center mb-1 pulse-animation">
                <span class="material-symbols-outlined text-primary mr-2 text-sm animate-spin">progress_activity</span>
                <span class="font-label-sm text-label-sm text-on-surface font-semibold">${stageLabel}</span>
              </div>
              <div class="w-full h-1.5 bg-outline-variant/30 rounded-full overflow-hidden">
                <div class="h-full bg-primary rounded-full transition-all duration-500 ease-out" style="width:${pct}%"></div>
              </div>
            </div>
          </div>
        </div>`;
      }

      const btnLabel = isSuccess ? 'Download again' : fmt.premium && !dl.pro ? 'Upgrade' : 'Download';
      const btnIcon = isSuccess ? 'refresh' : fmt.premium && !dl.pro ? 'lock' : 'download';

      return `
      <div class="bg-surface border border-outline-variant/30 rounded-lg p-stack-md flex items-center justify-between hover:border-primary/50 hover:shadow-sm transition-all group" data-quality="${id}">
        <div class="flex items-center gap-stack-md ml-2">
          <div class="w-12 h-12 rounded-lg bg-surface-container flex items-center justify-center">
            <span class="font-title-lg text-title-lg text-on-surface-variant font-bold">${formatQualityBadge(id)}</span>
          </div>
          <div>
            <div class="flex items-center gap-stack-sm">
              <span class="font-label-md text-label-md text-on-surface font-semibold">${formatQualityLabel(id)}</span>
              ${badge}
            </div>
            <span class="font-body-md text-body-md text-on-surface-variant text-sm mt-0.5 block">MP4 • ${size}</span>
          </div>
        </div>
        <button type="button" data-stitch-download="${id}" class="bg-surface-container-high text-on-surface flex items-center gap-stack-xs px-4 py-2.5 rounded-lg font-label-md text-label-md hover:bg-surface-variant hover:text-primary transition-all active:scale-95 group-hover:-translate-y-0.5">
          <span class="material-symbols-outlined text-[20px]">${btnIcon}</span>
          <span class="hidden sm:inline">${btnLabel}</span>
        </button>
      </div>`;
    })
    .join('');

  if (dl.phase === 'success') {
    const banner = document.createElement('div');
    banner.className =
      'mt-stack-md p-stack-md rounded-lg bg-secondary-container/30 border border-secondary/20 text-center';
    banner.innerHTML = `<p class="font-label-md text-label-md text-on-secondary-container font-semibold">Download complete! Check your downloads folder.</p>
      <button type="button" data-stitch-reset class="mt-2 text-primary font-label-sm text-label-sm hover:underline">Download another video</button>`;
    const existing = results?.querySelector('[data-stitch-success]');
    if (!existing) {
      banner.setAttribute('data-stitch-success', '');
      formatContainer.after(banner);
    }
  } else {
    results?.querySelector('[data-stitch-success]')?.remove();
  }

  if (dl.error && dl.phase === 'error') {
    let err = results?.querySelector('[data-stitch-error]') as HTMLElement | null;
    if (!err) {
      err = document.createElement('div');
      err.setAttribute('data-stitch-error', '');
      err.className = 'mt-stack-md p-stack-md rounded-lg bg-error-container text-on-error-container text-sm';
      formatContainer.before(err);
    }
    err.textContent = dl.error;
  } else {
    results?.querySelector('[data-stitch-error]')?.remove();
  }
}

function wireEvents(root: HTMLElement, getDl: () => DownloaderState) {
  const input = root.querySelector<HTMLInputElement>('[data-stitch="url-input"]');
  const analyzeBtn = root.querySelector<HTMLButtonElement>('[data-stitch="analyze"]');

  const onInput = () => getDl().setUrl(input?.value ?? '');
  const onAnalyze = (e: Event) => {
    e.preventDefault();
    getDl().analyze();
  };

  input?.addEventListener('input', onInput);
  analyzeBtn?.addEventListener('click', onAnalyze);

  const onDownloadClick = (e: Event) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-stitch-download]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const dl = getDl();
    const q = btn.dataset.stitchDownload as QualityId;
    if (dl.phase === 'success') {
      dl.handleRedownload();
      return;
    }
    dl.handleDownload(q, dl.codecMode);
  };

  const onReset = (e: Event) => {
    if ((e.target as HTMLElement).closest('[data-stitch-reset]')) {
      e.preventDefault();
      getDl().handleReset();
    }
  };

  root.addEventListener('click', onDownloadClick);
  root.addEventListener('click', onReset);

  return () => {
    input?.removeEventListener('input', onInput);
    analyzeBtn?.removeEventListener('click', onAnalyze);
    root.removeEventListener('click', onDownloadClick);
    root.removeEventListener('click', onReset);
  };
}

export function HomePage() {
  const dl = useDownloader();
  const dlRef = useRef(dl);
  dlRef.current = dl;

  const handleMount = useCallback((root: HTMLDivElement) => {
    const cleanup = wireEvents(root, () => dlRef.current);
    syncDom(root, dlRef.current);
    return cleanup;
  }, []);

  useEffect(() => {
    const root = document.querySelector<HTMLDivElement>('.stitch-page');
    if (root) syncDom(root, dl);
  }, [dl]);

  return (
    <>
      <StitchHtmlPage html={stitchPages.home} onMount={handleMount} />
      <p className="sr-only" role="status" aria-live="polite">
        {dl.phase === 'downloading' ? 'Downloading…' : dl.phase === 'success' ? 'Download complete' : dl.error ?? ''}
      </p>
    </>
  );
}
