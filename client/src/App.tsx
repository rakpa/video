import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AvailableFormat, CodecMode, Phase, ProgressUpdate, QualityId, VideoInfo } from './types';
import { useTheme, type Theme } from './hooks/useTheme';
import { detectPlatform, normalizeUrl } from './utils/platform';
import { API_NOT_CONFIGURED_MSG, isApiConfigured } from './config/api';
import { PLACEHOLDER_FORMATS } from './utils/formats';
import { fetchClientInstagramPreview } from './utils/instagram';
import { fetchClientYoutubePreview } from './utils/youtube';
import { preloadThumbnail, warmThumbnailFetch, type PreloadedThumb } from './utils/preloadThumb';
import { licenseToken, maxAllowedHeight } from './lib/license';
import { fetchBillingConfig } from './api/client';
import { useStripeReturn } from './hooks/useStripeReturn';
import {
  ApiError,
  fetchVideoInfo,
  fetchVideoPreview,
  isMobileDevice,
  pingApiWarmup,
  warmSocialPreview,
  startDownloadJob,
  subscribeProgress,
  triggerFileDownload,
} from './api/client';
import {
  cancelMobileGalleryGestureFallback,
  waitForMobileGalleryPayload,
  type ShareResult,
  type VideoFilePayload,
} from './utils/saveVideo';

import { useRoute, navigate } from './hooks/useRoute';
import { useDocumentMeta } from './hooks/useDocumentMeta';
import { LegalPage, LEGAL_ROUTES } from './pages/LegalPages';
import { ContentPage, CONTENT_ROUTES } from './pages/ContentPages';
import { PricingPage } from './pages/PricingPage';
import { SiteHeader } from './components/SiteHeader';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { FeatureGrid } from './components/FeatureGrid';
import { Faq } from './components/Faq';
import { SeoContent } from './components/SeoContent';
import { UrlInput } from './components/UrlInput';
import { VideoPreview, VideoPreviewSkeleton } from './components/VideoPreview';
import { QualitySelector } from './components/QualitySelector';
import { ProUpgradePanel } from './components/ProUpgradePanel';
import { DownloadProgress } from './components/DownloadProgress';
import { MobileSavePrompt } from './components/MobileSavePrompt';
import { SuccessState } from './components/SuccessState';
import { ErrorBanner } from './components/ErrorBanner';
import { Footer } from './components/Footer';
import { COMPANY } from './config/company';

const HOME_FAQ = [
  {
    q: `Is ${COMPANY.brand} free to use?`,
    a: 'Yes. You can download videos up to 1080p with sound, for free, with no account. Pro unlocks 2K, 4K, MP3 audio, and unlimited downloads.',
  },
  {
    q: 'Which sites are supported?',
    a: `YouTube, Facebook, and Instagram links work today. Just paste a standard video URL and ${COMPANY.brand} detects the platform automatically.`,
  },
  {
    q: 'Do downloads include audio?',
    a: 'Always. Video and audio streams are merged server-side into a single ready-to-play MP4 — you never get a silent file.',
  },
  {
    q: 'Where are my files stored?',
    a: 'Nowhere permanent. We process your download, stream it to your device, and then automatically delete it from our servers. We keep no copies.',
  },
  {
    q: 'Is downloading videos legal?',
    a: `You are responsible for only downloading content you own or have the rights to. ${COMPANY.brand} is a tool for personal, lawful use — please respect each platform’s terms and copyright law.`,
  },
];

const INITIAL_PROGRESS: ProgressUpdate = {
  percent: 0,
  speed: null,
  eta: null,
  stage: 'downloading',
  streamIndex: 1,
  streamTotal: 1,
};

/** Top-level router: legal pages vs. the main downloader app. */
export default function App() {
  const { theme, toggle } = useTheme();
  const route = useRoute();

  if (LEGAL_ROUTES[route]) {
    return <LegalPage path={route} theme={theme} onToggleTheme={toggle} />;
  }
  if (CONTENT_ROUTES[route]) {
    return <ContentPage path={route} theme={theme} onToggleTheme={toggle} />;
  }
  if (route === '/pricing') {
    return <PricingPage theme={theme} onToggleTheme={toggle} />;
  }
  return <DownloaderApp theme={theme} onToggleTheme={toggle} />;
}

function DownloaderApp({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  useDocumentMeta({
    title: COMPANY.pageTitle,
    description:
      'Download YouTube, Facebook and Instagram videos in HD, 2K and 4K — always with sound, no watermark, no sign-up. Free online video downloader.',
  });
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate>(INITIAL_PROGRESS);
  const [activeQuality, setActiveQuality] = useState<QualityId | null>(null);
  const [outputHeight, setOutputHeight] = useState<number | null>(null);

  const [selected, setSelected] = useState<QualityId>('1080');
  const [codecMode, setCodecMode] = useState<CodecMode>('best');
  const [freeMaxHeight, setFreeMaxHeight] = useState(720);
  const [maxHeight, setMaxHeight] = useState(() => maxAllowedHeight(720));
  // True while the slow full /api/info (real sizes/availability) is still loading
  // in the background, after the fast preview has already shown the cards.
  const [refining, setRefining] = useState(false);
  /** IG/FB: true once /api/info finished — info-json is warm for instant download start. */
  const [infoWarm, setInfoWarm] = useState(false);
  /** IG/FB: decoded thumbnail — card stays on skeleton until this is set. */
  const [preloadedThumb, setPreloadedThumb] = useState<PreloadedThumb | null>(null);
  /** Mobile: user tapped Download — preparing file for save sheet. */
  const [mobileSaving, setMobileSaving] = useState(false);
  /** Mobile: gallery-ready file after user confirms quality + Download. */
  const [mobileSavePayload, setMobileSavePayload] = useState<VideoFilePayload | null>(null);

  const lastJobId = useRef<string | null>(null);
  // The pre-fetched, gallery-ready video so the Save tap can open the share
  // sheet synchronously (Web Share needs a live user gesture).
  const galleryPayload = useRef<VideoFilePayload | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const fetchedUrl = useRef<string>('');
  const prevUrlLen = useRef(0);
  const infoWarmPromise = useRef<Promise<void> | null>(null);
  const infoWarmRef = useRef(false);
  const prefetchJobId = useRef<string | null>(null);
  const prefetchUrl = useRef('');
  const prefetchKeyRef = useRef('');
  const prefetchPayloadPromise = useRef<Promise<VideoFilePayload | null> | null>(null);
  const socialRevealedRef = useRef(false);
  const autoShareKeyRef = useRef('');
  const proPanelRef = useRef<HTMLDivElement>(null);

  const mobilePrefetchKey = useCallback(
    (normalized: string, quality: QualityId, isIgFb: boolean) =>
      `${normalized}:${quality}${isIgFb ? ':igfb' : ''}`,
    [],
  );

  /** Mobile: prepare file after user picks quality and taps Download. */
  const ensureMobilePayload = useCallback(
    async (normalized: string, quality: QualityId, isIgFb: boolean): Promise<VideoFilePayload> => {
      const key = mobilePrefetchKey(normalized, quality, isIgFb);
      if (prefetchKeyRef.current === key && galleryPayload.current) {
        return galleryPayload.current;
      }
      if (prefetchKeyRef.current === key && prefetchPayloadPromise.current) {
        const cached = await prefetchPayloadPromise.current;
        if (cached) return cached;
      }

      if (isIgFb && !infoWarmRef.current) {
        await infoWarmPromise.current?.catch(() => undefined);
        if (!infoWarmRef.current) {
          throw new Error('Still loading video info. Wait a moment and try again.');
        }
      }

      if (prefetchKeyRef.current !== key) {
        galleryPayload.current = null;
        prefetchPayloadPromise.current = null;
      }
      prefetchKeyRef.current = key;
      prefetchUrl.current = normalized;
      prefetchJobId.current = null;

      const run = startDownloadJob(normalized, quality, 'compatible', licenseToken(), {
        fast: true,
        reuse: false,
      })
        .then((jobId) => {
          if (prefetchKeyRef.current !== key) return null;
          prefetchJobId.current = jobId;
          lastJobId.current = jobId;
          return waitForMobileGalleryPayload(jobId);
        })
        .then((payload) => {
          if (prefetchKeyRef.current !== key || !payload) return null;
          galleryPayload.current = payload;
          return payload;
        });

      prefetchPayloadPromise.current = run;
      const payload = await run;
      if (!payload) throw new Error('Could not prepare this video. Try again.');
      return payload;
    },
    [mobilePrefetchKey],
  );

  const handleMobileSaved = useCallback(
    (result: ShareResult) => {
      if (result === 'unavailable') return;
      setError(null);
      if (result === 'shared' && fetchedUrl.current && info) {
        const isIgFb = info.platform === 'instagram' || info.platform === 'facebook';
        autoShareKeyRef.current = mobilePrefetchKey(fetchedUrl.current, selected, isIgFb);
      }
    },
    [info, selected, mobilePrefetchKey],
  );

  const handleMobileDownloadAnother = useCallback(() => {
    cancelMobileGalleryGestureFallback();
    setMobileSavePayload(null);
    setMobileSaving(false);
    setUrl('');
    setPhase('idle');
    setInfo(null);
    setError(null);
    setPreloadedThumb(null);
    fetchedUrl.current = '';
    autoShareKeyRef.current = '';
    galleryPayload.current = null;
    prefetchKeyRef.current = '';
    prefetchPayloadPromise.current = null;
    socialRevealedRef.current = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const refreshEntitlement = useCallback(() => {
    setMaxHeight(maxAllowedHeight(freeMaxHeight));
  }, [freeMaxHeight]);

  useEffect(() => {
    fetchBillingConfig()
      .then((c) => {
        setFreeMaxHeight(c.freeMaxHeight);
        setMaxHeight(maxAllowedHeight(c.freeMaxHeight));
      })
      .catch(() => undefined);
  }, []);

  useStripeReturn(useCallback(() => refreshEntitlement(), [refreshEntitlement]));

  const pickDefault = (formats: AvailableFormat[]): QualityId =>
    (formats.find((f) => f.id === '1080' && f.available) ?? formats.find((f) => f.available) ?? formats[0]).id;

  const handleFetch = useCallback(async (target: string) => {
    const normalized = normalizeUrl(target);
    if (!isApiConfigured()) {
      setError(API_NOT_CONFIGURED_MSG);
      setPhase('error');
      return;
    }

    setError(null);
    setPhase('preview');
    setRefining(true);
    setInfoWarm(false);
    infoWarmRef.current = false;
    infoWarmPromise.current = null;
    prefetchJobId.current = null;
    prefetchUrl.current = '';
    prefetchKeyRef.current = '';
    prefetchPayloadPromise.current = null;
    socialRevealedRef.current = false;
    autoShareKeyRef.current = '';
    cancelMobileGalleryGestureFallback();
    galleryPayload.current = null;
    setMobileSaving(false);
    setMobileSavePayload(null);
    setPreloadedThumb(null);
    fetchedUrl.current = normalized;

    pingApiWarmup();

    const platform = detectPlatform(normalized)!;
    const isSocial = platform.id === 'instagram' || platform.id === 'facebook';

    const revealSocialPreview = (card: VideoInfo): boolean => {
      if (!card.thumbnail || socialRevealedRef.current) return socialRevealedRef.current;
      socialRevealedRef.current = true;
      warmThumbnailFetch(card);
      setInfo((prev) => ({
        ...card,
        formats: prev?.formats ?? PLACEHOLDER_FORMATS,
      }));
      setPhase('ready');
      void preloadThumbnail(card).then((loaded) => {
        if (fetchedUrl.current !== normalized) return;
        if (loaded) setPreloadedThumb(loaded);
      });
      return true;
    };

    const instant =
      platform.id === 'youtube' ? await fetchClientYoutubePreview(normalized) : null;

    if (!isSocial) {
      setInfo({
        platform: platform.id,
        id: instant?.id ?? '',
        title: instant?.title ?? 'Loading…',
        author: instant?.author ?? '…',
        durationSeconds: null,
        thumbnail: instant?.thumbnail ?? null,
        formats: PLACEHOLDER_FORMATS,
      });
      if (instant) setPhase('ready');
    }

    const previewPromise = fetchVideoPreview(normalized).catch(() => null);
    const infoPromise = fetchVideoInfo(normalized).then((data) => {
      if (fetchedUrl.current === normalized) {
        infoWarmRef.current = true;
        setInfoWarm(true);
      }
      return data;
    });
    infoWarmPromise.current = infoPromise.then(() => undefined).catch(() => undefined);
    let hasPreview = Boolean(instant);

    if (!isSocial) {
      void previewPromise.then((preview) => {
        if (!preview || fetchedUrl.current !== normalized) return;
        hasPreview = true;
        setInfo((prev) => ({
          ...prev!,
          ...preview,
          formats: prev?.formats ?? PLACEHOLDER_FORMATS,
          title: preview.title || prev?.title || 'Untitled video',
          author: preview.author || prev?.author || 'Unknown',
          thumbnail: preview.thumbnail ?? prev?.thumbnail ?? null,
        }));
        setPhase((p) => (p === 'preview' ? 'ready' : p));
      });
    } else {
      if (platform.id === 'instagram') {
        void fetchClientInstagramPreview(normalized).then((client) => {
          if (!client.thumbnail || fetchedUrl.current !== normalized) return;
          revealSocialPreview({
            ...client,
            platform: platform.id,
            formats: PLACEHOLDER_FORMATS,
          });
        });
      }

      void previewPromise.then((preview) => {
        if (!preview?.thumbnail || fetchedUrl.current !== normalized) return;
        hasPreview = true;
        revealSocialPreview({
          platform: platform.id,
          id: preview.id,
          title: preview.title || 'Untitled video',
          author: preview.author || 'Unknown',
          durationSeconds: preview.durationSeconds ?? null,
          thumbnail: preview.thumbnail,
          formats: PLACEHOLDER_FORMATS,
        });
      });
    }

    try {
      if (isSocial) {
        const data = await infoPromise;
        if (fetchedUrl.current !== normalized) return;

        if (socialRevealedRef.current) {
          setInfo((prev) =>
            prev
              ? {
                  ...prev,
                  formats: data.formats,
                  durationSeconds: data.durationSeconds ?? prev.durationSeconds,
                }
              : prev,
          );
        } else {
          const card: VideoInfo = {
            platform: platform.id,
            id: data.id,
            title: data.title || 'Untitled video',
            author: data.author || 'Unknown',
            durationSeconds: data.durationSeconds,
            thumbnail: data.thumbnail,
            formats: PLACEHOLDER_FORMATS,
          };
          if (!revealSocialPreview(card)) {
            setInfo(card);
            setPhase('ready');
          }
        }
        setSelected((current) => {
          const chosen = data.formats.find((f) => f.id === current);
          return chosen?.available ? current : pickDefault(data.formats);
        });
      } else {
        const data = await infoPromise;
        if (fetchedUrl.current !== normalized) return;
        setInfo((prev) => ({
          ...data,
          title: data.title || prev?.title || 'Untitled video',
          author: data.author || prev?.author || 'Unknown',
          thumbnail: data.thumbnail ?? prev?.thumbnail ?? null,
        }));
        setSelected((current) => {
          const chosen = data.formats.find((f) => f.id === current);
          return chosen?.available ? current : pickDefault(data.formats);
        });
        setPhase((p) => (p === 'preview' || p === 'fetching' ? 'ready' : p));
      }
    } catch (e) {
      if (fetchedUrl.current !== normalized) return;
      if (isSocial) {
        const preview = await previewPromise.catch(() => null);
        if (preview?.thumbnail) {
          hasPreview = true;
          const card: VideoInfo = {
            ...preview,
            platform: platform.id,
            formats: PLACEHOLDER_FORMATS,
          };
          if (!revealSocialPreview(card)) {
            setInfo(card);
            setPhase('ready');
          }
          setInfoWarm(false);
          infoWarmRef.current = false;
        } else {
          setError(e instanceof ApiError ? e.message : 'Could not fetch that video.');
          setPhase((p) => (p === 'downloading' || p === 'success' ? p : 'error'));
        }
      } else if (hasPreview || instant) {
        setPhase((p) => (p === 'downloading' || p === 'success' ? p : 'ready'));
      } else {
        setError(e instanceof ApiError ? e.message : 'Could not fetch that video.');
        setPhase((p) => (p === 'downloading' || p === 'success' ? p : 'error'));
      }
    } finally {
      if (fetchedUrl.current === normalized) setRefining(false);
    }
  }, []);

  useEffect(() => {
    const trimmed = url.trim();
    const normalized = normalizeUrl(trimmed);
    const likelyPaste = trimmed.length - prevUrlLen.current > 8;
    prevUrlLen.current = trimmed.length;

    if (!detectPlatform(trimmed)) {
      if (phase !== 'idle' && phase !== 'downloading') {
        setInfo(null);
        setPhase('idle');
        setError(null);
        fetchedUrl.current = '';
      }
      return;
    }
    if (normalized === fetchedUrl.current || phase === 'downloading') return;
    const isSocial =
      detectPlatform(trimmed)?.id === 'instagram' || detectPlatform(trimmed)?.id === 'facebook';
    if (isSocial) {
      pingApiWarmup();
      warmSocialPreview(normalized);
    }
    const delay = likelyPaste || isSocial ? 0 : 200;
    const t = setTimeout(() => handleFetch(trimmed), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleDownload = useCallback(
    async (quality: QualityId, mode: CodecMode) => {
      if (!info) return;
      const fmt = info.formats.find((f) => f.id === quality);
      if (fmt && fmt.height > maxHeight) {
        proPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      setError(null);
      setActiveQuality(quality);

      const platform = detectPlatform(fetchedUrl.current || url);
      const mobile = isMobileDevice();
      const isIgFb = platform?.id === 'instagram' || platform?.id === 'facebook';
      const currentUrl = fetchedUrl.current || url;

      /** Mobile: user chose quality → prepare file → save-to-gallery prompt. */
      if (mobile) {
        setMobileSaving(true);
        setMobileSavePayload(null);
        try {
          const payload = await ensureMobilePayload(currentUrl, quality, isIgFb);
          setMobileSavePayload(payload);
        } catch (e) {
          setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Could not prepare this video.');
          setPhase('error');
        } finally {
          setMobileSaving(false);
        }
        return;
      }

      setProgress(INITIAL_PROGRESS);
      galleryPayload.current = null;
      setOutputHeight(null);
      setPhase('downloading');
      setProgress({ ...INITIAL_PROGRESS, percent: 1 });
      try {
        if (isIgFb && !infoWarmRef.current) {
          await infoWarmPromise.current?.catch(() => undefined);
          if (!infoWarmRef.current) {
            throw new Error('Still preparing this video. Wait a moment and try again.');
          }
        }

        const attachDesktopJob = (jobId: string) => {
          lastJobId.current = jobId;
          unsubscribe.current?.();
          unsubscribe.current = subscribeProgress(jobId, {
            onProgress: (p) => setProgress(p),
            onDone: (height) => {
              if (typeof height === 'number') setOutputHeight(height);
              void triggerFileDownload(jobId);
              setPhase('success');
            },
            onError: (message) => {
              setError(message);
              setPhase('error');
            },
          });
        };

        const effectiveMode: CodecMode = isIgFb ? 'compatible' : mode;
        const jobId = await startDownloadJob(
          currentUrl,
          quality,
          effectiveMode,
          licenseToken(),
          { fast: isIgFb, reuse: true },
        );
        attachDesktopJob(jobId);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Could not start the download.');
        setPhase('error');
      }
    },
    [info, url, maxHeight, ensureMobilePayload],
  );

  const qualityLabel = info?.formats.find((f) => f.id === activeQuality)?.label ?? '';
  const selectedFmt = info?.formats.find((f) => f.id === selected);
  const showProUpgrade = Boolean(selectedFmt && selectedFmt.height > maxHeight);

  const dismissProUpgrade = useCallback(() => {
    if (!info) return;
    const freeFmt =
      info.formats
        .filter((f) => f.height <= maxHeight && f.available)
        .sort((a, b) => b.height - a.height)[0] ??
      info.formats.find((f) => f.id === '720') ??
      info.formats.find((f) => f.height <= maxHeight);
    if (freeFmt) setSelected(freeFmt.id);
  }, [info, maxHeight]);
  const isBusy = phase === 'fetching' || phase === 'preview' || phase === 'downloading';
  const isSocialPreview = info?.platform === 'instagram' || info?.platform === 'facebook';
  const previewCardReady = isSocialPreview
    ? Boolean(info?.thumbnail)
    : Boolean(info) && phase !== 'idle' && phase !== 'fetching';

  const view: 'ready' | 'downloading' | 'success' | null =
    phase === 'downloading' && !isMobileDevice()
      ? 'downloading'
      : phase === 'success' && !isMobileDevice()
        ? 'success'
        : phase === 'ready' || phase === 'preview' || phase === 'error'
          ? 'ready'
          : null;

  const showQualityPanel =
    Boolean(info) &&
    previewCardReady &&
    !mobileSavePayload &&
    (view === 'ready' || (isMobileDevice() && mobileSaving));

  return (
    <div className="app-bg min-h-screen text-slate-600">
      <SiteHeader theme={theme} onToggleTheme={onToggleTheme} />

      <main className="mx-auto max-w-5xl px-5">
        <section className="pt-14 sm:pt-24">
          <Hero />
          <div className="mx-auto mt-14 max-w-3xl">
            <UrlInput value={url} onChange={setUrl} />
            <div className="mt-7 flex flex-col items-center gap-4">
              <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs font-medium text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                  <CheckDot /> Free
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckDot /> No sign-up
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckDot /> No watermark
                </span>
              </p>

              <p className="text-center text-xs text-slate-400">
                By using {COMPANY.brand} you accept our{' '}
                <button onClick={() => navigate('/terms')} className="font-medium text-indigo-600 transition hover:text-indigo-700 hover:underline">
                  Terms of Service
                </button>{' '}
                and{' '}
                <button onClick={() => navigate('/privacy')} className="font-medium text-indigo-600 transition hover:text-indigo-700 hover:underline">
                  Privacy Policy
                </button>
                .
              </p>

              <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-500" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
                </svg>
                Secure & malware-free · SSL encrypted
              </span>
            </div>
          </div>
        </section>

        <section className="mx-auto mt-8 max-w-3xl space-y-5">
          <AnimatePresence mode="popLayout">
            {error && phase === 'error' && (
              <ErrorBanner
                key="err"
                message={error}
                onDismiss={() => setError(null)}
                onRetry={fetchedUrl.current ? () => handleFetch(fetchedUrl.current) : undefined}
              />
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {((info && view) || phase === 'preview') && (
              <motion.div
                key={view ?? 'preview'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                <>
                  {!previewCardReady || !info ? (
                    <VideoPreviewSkeleton />
                  ) : (
                    <VideoPreview info={info} preloadedThumb={preloadedThumb} />
                  )}
                  {info && view === 'downloading' ? (
                    <DownloadProgress
                      progress={progress}
                      qualityLabel={qualityLabel}
                    />
                  ) : info && view === 'success' ? (
                    <SuccessState outputHeight={outputHeight} requestedLabel={qualityLabel || undefined} />
                  ) : info && isMobileDevice() && mobileSavePayload ? (
                    <MobileSavePrompt
                      payload={mobileSavePayload}
                      author={info.author}
                      onSaved={handleMobileSaved}
                      onDownloadAnother={handleMobileDownloadAnother}
                    />
                  ) : showQualityPanel ? (
                    <>
                      <QualitySelector
                        formats={info!.formats}
                        selected={selected}
                        onSelect={setSelected}
                        mode={codecMode}
                        onModeChange={setCodecMode}
                        maxHeight={maxHeight}
                        refining={refining}
                        sourceMaxHeight={info!.sourceMaxHeight}
                        downloadReady={
                          (info!.platform !== 'instagram' && info!.platform !== 'facebook') || infoWarm
                        }
                        saving={mobileSaving}
                        onDownload={() => void handleDownload(selected, codecMode)}
                        onUpgrade={() => proPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                        onUseFree={() => dismissProUpgrade()}
                      />
                      <AnimatePresence>
                        {showProUpgrade && (
                          <motion.div
                            ref={proPanelRef}
                            id="pro-upgrade"
                            key="pro-panel"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.35 }}
                          >
                            <ProUpgradePanel inline selectedQuality={selectedFmt?.label} onDismiss={dismissProUpgrade} />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  ) : null}
                </>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {phase === 'idle' && (
          <>
            <HowItWorks />
            <FeatureGrid />
            <Faq items={HOME_FAQ} subtitle="Everything you might want to know before your first download." />
            <SeoContent />
          </>
        )}
      </main>

      <Footer />

      <div className="pointer-events-none fixed -left-32 top-1/3 -z-10 h-72 w-72 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none fixed -right-24 top-20 -z-10 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" aria-hidden="true" />

      <p className="sr-only" role="status" aria-live="polite">
        {isBusy ? 'Working…' : phase === 'success' ? 'Download complete' : error ?? ''}
      </p>
    </div>
  );
}

function CheckDot() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  );
}
