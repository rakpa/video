import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AvailableFormat, CodecMode, Phase, ProgressUpdate, QualityId, VideoInfo } from './types';
import { useTheme, type Theme } from './hooks/useTheme';
import { detectPlatform, normalizeUrl } from './utils/platform';
import { API_NOT_CONFIGURED_MSG, isApiConfigured } from './config/api';
import { PLACEHOLDER_FORMATS } from './utils/formats';
import { isPro, licenseToken } from './lib/license';
import { useStripeReturn } from './hooks/useStripeReturn';
import {
  ApiError,
  fetchVideoInfo,
  fetchVideoPreview,
  isMobileDevice,
  startDownloadJob,
  subscribeProgress,
  triggerFileDownload,
} from './api/client';
import { isMobileDevice, saveMobileVideoToGallery } from './utils/saveVideo';

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
import { SuccessState } from './components/SuccessState';
import { ErrorBanner } from './components/ErrorBanner';
import { Footer } from './components/Footer';

const HOME_FAQ = [
  {
    q: 'Is ClipVault free to use?',
    a: 'Yes. You can download videos up to 1080p with sound, for free, with no account. Pro unlocks 2K, 4K, MP3 audio, and unlimited downloads.',
  },
  {
    q: 'Which sites are supported?',
    a: 'YouTube, Facebook, and Instagram links work today. Just paste a standard video URL and ClipVault detects the platform automatically.',
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
    a: 'You are responsible for only downloading content you own or have the rights to. ClipVault is a tool for personal, lawful use — please respect each platform’s terms and copyright law.',
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
    title: 'ClipVault — Free Video Downloader for YouTube, Facebook & Instagram',
    description:
      'Download YouTube, Facebook and Instagram videos in HD, 2K and 4K — always with sound, no watermark, no sign-up. Free online video downloader.',
  });
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate>(INITIAL_PROGRESS);
  const [activeQuality, setActiveQuality] = useState<QualityId | null>(null);

  const [selected, setSelected] = useState<QualityId>('1080');
  const [codecMode, setCodecMode] = useState<CodecMode>('best');
  const [pro, setPro] = useState(isPro);
  // True while the slow full /api/info (real sizes/availability) is still loading
  // in the background, after the fast preview has already shown the cards.
  const [refining, setRefining] = useState(false);
  const [savingToGallery, setSavingToGallery] = useState(false);

  const lastJobId = useRef<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const fetchedUrl = useRef<string>('');
  const prevUrlLen = useRef(0);
  const proPanelRef = useRef<HTMLDivElement>(null);

  useStripeReturn(useCallback(() => setPro(true), []));

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
    fetchedUrl.current = normalized;

    const platform = detectPlatform(normalized)!;
    setInfo({
      platform: platform.id,
      id: '',
      title: 'Loading…',
      author: '…',
      durationSeconds: null,
      thumbnail: null,
      formats: PLACEHOLDER_FORMATS,
    });

    // Fast preview (thumbnail/title) first so the card + Download button are
    // usable in ~1s, instead of waiting on the slow full-info extraction.
    const preview = await fetchVideoPreview(normalized).catch(() => null);
    if (fetchedUrl.current !== normalized) return;
    let hasPreview = false;
    if (preview) {
      hasPreview = true;
      setInfo((prev) => ({ ...preview, formats: prev?.formats ?? PLACEHOLDER_FORMATS }));
      // The button is usable now — the download runs its own extraction, so don't
      // make the user wait on the full-info call just to click Download.
      setPhase((p) => (p === 'preview' ? 'ready' : p));
    }

    // Full info (accurate sizes/availability) refines the cards in the background.
    try {
      const data = await fetchVideoInfo(normalized);
      if (fetchedUrl.current !== normalized) return;
      setInfo((prev) => ({
        ...data,
        title: data.title || prev?.title || 'Untitled video',
        author: data.author || prev?.author || 'Unknown',
        thumbnail: prev?.thumbnail ?? data.thumbnail,
      }));
      setSelected((current) => {
        const chosen = data.formats.find((f) => f.id === current);
        return chosen?.available ? current : pickDefault(data.formats);
      });
      setPhase((p) => (p === 'preview' || p === 'fetching' ? 'ready' : p));
    } catch (e) {
      if (fetchedUrl.current !== normalized) return;
      if (hasPreview) {
        // Full info failed but the preview gave us a usable card — keep it and
        // let the user try the download (it extracts independently).
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
    const delay = likelyPaste ? 0 : 200;
    const t = setTimeout(() => handleFetch(trimmed), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const handleDownload = useCallback(
    async (quality: QualityId, mode: CodecMode) => {
      if (!info) return;
      const fmt = info.formats.find((f) => f.id === quality);
      if (fmt?.premium && !pro) {
        proPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      setError(null);
      setActiveQuality(quality);
      setProgress(INITIAL_PROGRESS);
      setPhase('downloading');
      try {
        // Instagram/Facebook often use HEVC — force H.264/AAC for gallery compatibility.
        const platform = detectPlatform(fetchedUrl.current || url);
        const effectiveMode: CodecMode =
          platform?.id === 'instagram' || platform?.id === 'facebook' ? 'compatible' : mode;
        // Use the SAME normalized URL that /api/info cached under, so the
        // download reuses that extraction (--load-info-json) instead of re-doing it.
        const jobId = await startDownloadJob(fetchedUrl.current || url, quality, effectiveMode, licenseToken());
        lastJobId.current = jobId;

        unsubscribe.current?.();
        unsubscribe.current = subscribeProgress(jobId, {
          onProgress: setProgress,
          onDone: () => {
            if (isMobileDevice()) {
              setPhase('success');
            } else {
              void triggerFileDownload(jobId);
              setPhase('success');
            }
          },
          onError: (message) => {
            setError(message);
            setPhase('error');
          },
        });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not start the download.');
        setPhase('error');
      }
    },
    [info, url, pro],
  );

  const handleSaveToGallery = useCallback(async () => {
    if (!lastJobId.current) return;
    setSavingToGallery(true);
    setError(null);
    try {
      await saveMobileVideoToGallery(lastJobId.current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save to gallery.');
    } finally {
      setSavingToGallery(false);
    }
  }, []);

  const handleRedownload = useCallback(() => {
    if (isMobileDevice()) {
      void handleSaveToGallery();
      return;
    }
    if (lastJobId.current) void triggerFileDownload(lastJobId.current);
  }, [handleSaveToGallery]);

  const handleReset = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    lastJobId.current = null;
    fetchedUrl.current = '';
    setUrl('');
    setInfo(null);
    setError(null);
    setActiveQuality(null);
    setProgress(INITIAL_PROGRESS);
    setPhase('idle');
  }, []);

  const qualityLabel = info?.formats.find((f) => f.id === activeQuality)?.label ?? '';
  const selectedFmt = info?.formats.find((f) => f.id === selected);
  const showProUpgrade = !pro && Boolean(selectedFmt?.premium);
  const isBusy = phase === 'fetching' || phase === 'preview' || phase === 'downloading';

  const view: 'ready' | 'downloading' | 'success' | null =
    phase === 'downloading'
      ? 'downloading'
      : phase === 'success'
        ? 'success'
      : phase === 'ready' || phase === 'preview' || phase === 'error'
        ? 'ready'
      : null;

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
                By using ClipVault you accept our{' '}
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
            {info && view && (
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="space-y-5"
              >
                {view === 'success' ? (
                  <SuccessState
                    title={info.title}
                    mobile={isMobileDevice()}
                    saving={savingToGallery}
                    onSaveToGallery={handleSaveToGallery}
                    onReset={handleReset}
                    onRedownload={handleRedownload}
                  />
                ) : (
                  <>
                    {info.thumbnail ? (
                      <VideoPreview info={info} />
                    ) : (
                      <VideoPreviewSkeleton />
                    )}
                    {view === 'downloading' ? (
                      <DownloadProgress progress={progress} qualityLabel={qualityLabel} />
                    ) : (
                      <>
                        <QualitySelector
                          formats={info.formats}
                          selected={selected}
                          onSelect={setSelected}
                          mode={codecMode}
                          onModeChange={setCodecMode}
                          pro={pro}
                          refining={refining}
                          onDownload={() => handleDownload(selected, codecMode)}
                          onUpgrade={() => proPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })}
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
                              <ProUpgradePanel inline selectedQuality={selectedFmt?.label} />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </>
                    )}
                  </>
                )}
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
