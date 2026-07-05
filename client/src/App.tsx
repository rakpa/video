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
import { resolveFormatAvailability } from './utils/qualityAvailability';
import {
  clipRangeFromInputs,
  formatClipRangeLabel,
  formatTimeInput,
  type ClipMode,
} from './utils/clipTime';
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
} from './api/client';
import {
  cancelMobileGalleryGestureFallback,
  downloadFileToDevice,
  fetchReadyVideoFile,
  formatDownloadError,
  type ShareResult,
  type VideoFilePayload,
} from './utils/saveVideo';

import { useRoute, navigate } from './hooks/useRoute';
import { useDocumentMeta } from './hooks/useDocumentMeta';
import { LegalPage, LEGAL_ROUTES } from './pages/LegalPages';
import { ContentPage, CONTENT_ROUTES } from './pages/ContentPages';
import { PricingPage } from './pages/PricingPage';
import { SiteHeader } from './components/SiteHeader';
import { HeroFeatures, HeroPlatforms, HeroTitle } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { FeatureGrid } from './components/FeatureGrid';
import { Faq } from './components/Faq';
import { SeoContent } from './components/SeoContent';
import { UrlInput } from './components/UrlInput';
import { VideoPreview, VideoPreviewSkeleton } from './components/VideoPreview';
import { QualitySelector } from './components/QualitySelector';
import { ProUpgradeCard } from './components/ProUpgradeCard';
import { ClipSelector, isClipReady } from './components/ClipSelector';
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

  if (route === '/') {
    return <DownloaderApp theme={theme} onToggleTheme={toggle} />;
  }
  if (LEGAL_ROUTES[route]) {
    return <LegalPage path={route} theme={theme} onToggleTheme={toggle} />;
  }
  if (CONTENT_ROUTES[route]) {
    return <ContentPage path={route} theme={theme} onToggleTheme={toggle} />;
  }
  if (route === '/pricing') {
    return <PricingPage theme={theme} onToggleTheme={toggle} />;
  }
  // Unknown path: show a real not-found page instead of silently rendering the
  // homepage (a soft-404 that hurts SEO and confuses users).
  return <NotFoundPage theme={theme} onToggleTheme={toggle} />;
}

/** Client-side 404 for unrecognized routes. */
function NotFoundPage({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  useDocumentMeta({
    title: `Page not found · ${COMPANY.brand}`,
    description: 'The page you were looking for does not exist.',
    robots: 'noindex, follow',
  });
  return (
    <div className="app-bg min-h-screen text-slate-600">
      <SiteHeader theme={theme} onToggleTheme={onToggleTheme} />
      <main className="mx-auto grid max-w-3xl place-items-center px-5 py-24 text-center">
        <p className="text-6xl font-extrabold tracking-tight text-slate-900">404</p>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Page not found</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-slate-500">
          The page you were looking for doesn’t exist or may have moved. Let’s get you back to
          downloading.
        </p>
        <button
          onClick={() => navigate('/')}
          className="btn-gradient mt-7 rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-glow-soft"
        >
          Back to {COMPANY.brand}
        </button>
      </main>
      <Footer />
    </div>
  );
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
  const [maxHeight, setMaxHeight] = useState(() => maxAllowedHeight());
  // True while the slow full /api/info (real sizes/availability) is still loading
  // in the background, after the fast preview has already shown the cards.
  const [refining, setRefining] = useState(false);
  /** IG/FB: true once /api/info finished — info-json is warm for instant download start. */
  const [infoWarm, setInfoWarm] = useState(false);
  /** IG/FB: decoded thumbnail — card stays on skeleton until this is set. */
  const [preloadedThumb, setPreloadedThumb] = useState<PreloadedThumb | null>(null);
  /** Mobile: gallery-ready file after download completes. */
  const [mobileSavePayload, setMobileSavePayload] = useState<VideoFilePayload | null>(null);
  /** Desktop: finished file is being handed off to the browser download manager. */
  const [delivering, setDelivering] = useState(false);
  const [clipMode, setClipMode] = useState<ClipMode>('full');
  const [clipStart, setClipStart] = useState('0:00');
  const [clipEnd, setClipEnd] = useState('');

  const lastJobId = useRef<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const fetchedUrl = useRef<string>('');
  const prevUrlLen = useRef(0);
  const infoWarmPromise = useRef<Promise<void> | null>(null);
  const infoWarmRef = useRef(false);
  const socialRevealedRef = useRef(false);
  const proPanelRef = useRef<HTMLDivElement>(null);
  /** Tracks which fetched URL we've already auto-scrolled to the preview card for,
   * so a re-render (e.g. progress ticks) doesn't keep yanking the page back down. */
  const scrolledPreviewUrlRef = useRef<string | null>(null);

  const activeClip = useCallback(() => {
    if (clipMode !== 'clip') return null;
    return clipRangeFromInputs(clipStart, clipEnd, info?.durationSeconds ?? null);
  }, [clipMode, clipStart, clipEnd, info?.durationSeconds]);

  const handleMobileSaved = useCallback(
    (result: ShareResult) => {
      if (result === 'unavailable') return;
      setError(null);
    },
    [],
  );

  const handleMobileDownloadAnother = useCallback(() => {
    cancelMobileGalleryGestureFallback();
    setMobileSavePayload(null);
    setDelivering(false);
    setUrl('');
    setPhase('idle');
    setInfo(null);
    setError(null);
    setPreloadedThumb(null);
    fetchedUrl.current = '';
    socialRevealedRef.current = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const refreshEntitlement = useCallback(() => {
    setMaxHeight(maxAllowedHeight());
  }, []);

  useEffect(() => {
    setMaxHeight(maxAllowedHeight());
  }, []);

  useEffect(() => {
    if (info?.durationSeconds != null && info.durationSeconds > 0) {
      setClipEnd(formatTimeInput(info.durationSeconds));
    }
  }, [info?.durationSeconds, info?.id]);

  useStripeReturn(useCallback(() => refreshEntitlement(), [refreshEntitlement]));

  const pickDefault = (formats: AvailableFormat[], sourceMaxHeight?: number | null): QualityId => {
    const resolved = resolveFormatAvailability(formats, sourceMaxHeight);
    return (
      resolved.find((f) => f.id === '1080' && f.available) ??
      resolved.find((f) => f.available && f.height <= maxHeight) ??
      resolved[0]
    ).id;
  };

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
    socialRevealedRef.current = false;
    cancelMobileGalleryGestureFallback();
    setMobileSavePayload(null);
    setDelivering(false);
    setPreloadedThumb(null);
    setClipMode('full');
    setClipStart('0:00');
    setClipEnd('');
    fetchedUrl.current = normalized;
    scrolledPreviewUrlRef.current = null;

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
          const resolved = resolveFormatAvailability(data.formats, data.sourceMaxHeight);
          const chosen = resolved.find((f) => f.id === current);
          return chosen?.available ? current : pickDefault(data.formats, data.sourceMaxHeight);
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
          const resolved = resolveFormatAvailability(data.formats, data.sourceMaxHeight);
          const chosen = resolved.find((f) => f.id === current);
          return chosen?.available ? current : pickDefault(data.formats, data.sourceMaxHeight);
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

  useEffect(() => {
    if (phase !== 'downloading' && phase !== 'success') return;
    const targetId = phase === 'success' ? 'download-success' : 'download-progress';
    const t = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [phase]);

  const handleDownload = useCallback(
    async (quality: QualityId, mode: CodecMode) => {
      if (!info) return;
      const fmt = info.formats.find((f) => f.id === quality);
      if (fmt && fmt.height > maxHeight) {
        proPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      const clip = activeClip();
      if (clipMode === 'clip' && !clip) {
        setError('Please enter a valid start and end time for your clip.');
        return;
      }

      setError(null);
      setActiveQuality(quality);

      const platform = detectPlatform(fetchedUrl.current || url);
      const mobile = isMobileDevice();
      const isIgFb = platform?.id === 'instagram' || platform?.id === 'facebook';
      const currentUrl = fetchedUrl.current || url;

      setMobileSavePayload(null);
      setDelivering(false);
      setProgress(INITIAL_PROGRESS);
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

        const effectiveMode: CodecMode = isIgFb ? 'compatible' : mode;
        const jobId = await startDownloadJob(
          currentUrl,
          quality,
          effectiveMode,
          licenseToken(),
          { fast: isIgFb || mobile, reuse: !mobile && !clip, clip },
        );

        lastJobId.current = jobId;
        unsubscribe.current?.();
        unsubscribe.current = subscribeProgress(jobId, {
          onProgress: (p) => setProgress(p),
          onDone: (height) => {
            if (typeof height === 'number') setOutputHeight(height);
            void (async () => {
              try {
                setProgress((p) => ({ ...p, percent: 100, stage: 'done', speed: null, eta: null }));
                if (mobile) {
                  const payload = await fetchReadyVideoFile(jobId);
                  setMobileSavePayload(payload);
                  setPhase('ready');
                } else {
                  setDelivering(true);
                  await downloadFileToDevice(jobId);
                  setDelivering(false);
                  setPhase('success');
                }
              } catch (e) {
                setDelivering(false);
                setError(formatDownloadError(e));
                setPhase('error');
              }
            })();
          },
          onError: (message) => {
            setError(message);
            setPhase('error');
          },
        });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Could not start the download.');
        setPhase('error');
      }
    },
    [info, url, maxHeight, clipMode, activeClip],
  );

  const clipReady = isClipReady(clipMode, clipStart, clipEnd, info?.durationSeconds ?? null);
  const downloadButtonLabel =
    clipMode === 'clip' && clipReady
      ? `Clip ${formatClipRangeLabel(clipStart, clipEnd)}`
      : undefined;

  const qualityLabel = info?.formats.find((f) => f.id === activeQuality)?.label ?? '';
  const selectedFmt = info?.formats.find((f) => f.id === selected);
  const showProUpgrade = Boolean(selectedFmt && selectedFmt.height > maxHeight);

  const dismissProUpgrade = useCallback(() => {
    if (!info) return;
    const formats = resolveFormatAvailability(info.formats, info.sourceMaxHeight);
    const freeFmt =
      formats
        .filter((f) => f.height <= maxHeight && f.available)
        .sort((a, b) => b.height - a.height)[0] ??
      formats.find((f) => f.id === '1080') ??
      formats.find((f) => f.id === '720') ??
      formats.find((f) => f.height <= maxHeight);
    if (freeFmt) setSelected(freeFmt.id);
  }, [info, maxHeight]);
  const isBusy = phase === 'fetching' || phase === 'preview' || phase === 'downloading';
  const isSocialPreview = info?.platform === 'instagram' || info?.platform === 'facebook';
  const previewCardReady = isSocialPreview
    ? Boolean(info?.thumbnail)
    : Boolean(info) && phase !== 'idle' && phase !== 'fetching';

  const view: 'ready' | 'downloading' | 'success' | null =
    phase === 'downloading'
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
    view === 'ready';

  // First-time-user feedback: once a pasted URL resolves to a loaded video card,
  // scroll down to it so it's obvious something happened — on mobile the card
  // otherwise loads ~3 screens below the fold, out of view.
  useEffect(() => {
    if (!previewCardReady) return;
    if (window.innerWidth >= 640) return;
    const currentUrl = fetchedUrl.current;
    if (!currentUrl || scrolledPreviewUrlRef.current === currentUrl) return;
    scrolledPreviewUrlRef.current = currentUrl;
    const t = window.setTimeout(() => {
      document.getElementById('video-preview-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [previewCardReady]);

  return (
    <div className="app-bg min-h-screen text-slate-600">
      <SiteHeader theme={theme} onToggleTheme={onToggleTheme} />

      <main className="mx-auto max-w-5xl px-5">
        <section className="flex flex-col pt-14 sm:pt-24">
          <HeroTitle />
          <div className="order-2 mx-auto mt-6 w-full max-w-3xl sm:order-3 sm:mt-14">
            <HeroPlatforms />
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
          <div className="order-3 mt-8 sm:order-2 sm:mt-9">
            <HeroFeatures />
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

          <AnimatePresence mode="popLayout">
            {(info || phase === 'preview') && (
              <motion.div
                key="downloader-card"
                id="video-preview-card"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                {!previewCardReady || !info ? (
                  <VideoPreviewSkeleton />
                ) : (
                  <VideoPreview info={info} preloadedThumb={preloadedThumb} />
                )}

                {info && view === 'downloading' ? (
                  <div id="download-progress">
                    <DownloadProgress
                      progress={progress}
                      qualityLabel={qualityLabel}
                      delivering={delivering}
                      clipLabel={
                        clipMode === 'clip' && clipReady
                          ? formatClipRangeLabel(clipStart, clipEnd)
                          : undefined
                      }
                    />
                  </div>
                ) : info && view === 'success' ? (
                  <div id="download-success">
                    <SuccessState outputHeight={outputHeight} requestedLabel={qualityLabel || undefined} />
                  </div>
                ) : info && isMobileDevice() && mobileSavePayload ? (
                  <MobileSavePrompt
                    payload={mobileSavePayload}
                    author={info.author}
                    onSaved={handleMobileSaved}
                    onDownloadAnother={handleMobileDownloadAnother}
                  />
                ) : showQualityPanel ? (
                  <div className="space-y-5">
                    <ClipSelector
                      durationSeconds={info!.durationSeconds}
                      mode={clipMode}
                      onModeChange={setClipMode}
                      startTime={clipStart}
                      endTime={clipEnd}
                      onStartTimeChange={setClipStart}
                      onEndTimeChange={setClipEnd}
                    />
                    <div className="mt-4">
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
                        onDownload={() => void handleDownload(selected, codecMode)}
                        onUpgrade={() => proPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
                        onUseFree={() => dismissProUpgrade()}
                        downloadLabel={downloadButtonLabel}
                        downloadDisabled={clipMode === 'clip' && !clipReady}
                      />
                    </div>
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
                          <ProUpgradeCard onDismiss={dismissProUpgrade} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : null}
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
