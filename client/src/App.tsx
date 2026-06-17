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
  startDownloadJob,
  subscribeProgress,
  triggerFileDownload,
} from './api/client';

import { useRoute, navigate } from './hooks/useRoute';
import { LegalPage, LEGAL_ROUTES } from './pages/LegalPages';
import { PricingPage } from './pages/PricingPage';
import { SiteHeader } from './components/SiteHeader';
import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { FeatureGrid } from './components/FeatureGrid';
import { Faq } from './components/Faq';
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
  if (route === '/pricing') {
    return <PricingPage theme={theme} onToggleTheme={toggle} />;
  }
  return <DownloaderApp theme={theme} onToggleTheme={toggle} />;
}

function DownloaderApp({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const [url, setUrl] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [info, setInfo] = useState<VideoInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressUpdate>(INITIAL_PROGRESS);
  const [activeQuality, setActiveQuality] = useState<QualityId | null>(null);

  const [selected, setSelected] = useState<QualityId>('1080');
  const [codecMode, setCodecMode] = useState<CodecMode>('best');
  const [pro, setPro] = useState(isPro);

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

    const previewPromise = fetchVideoPreview(normalized).catch(() => null);
    const fullPromise = fetchVideoInfo(normalized);

    try {
      const preview = await previewPromise;
      if (preview && fetchedUrl.current === normalized) {
        setInfo((prev) => ({ ...preview, formats: prev?.formats ?? PLACEHOLDER_FORMATS }));
      }

      const data = await fullPromise;
      if (fetchedUrl.current !== normalized) return;
      setInfo((prev) => ({
        ...data,
        thumbnail: prev?.thumbnail ?? data.thumbnail,
      }));
      setSelected((current) => {
        const chosen = data.formats.find((f) => f.id === current);
        return chosen?.available ? current : pickDefault(data.formats);
      });
      setPhase((p) => (p === 'preview' || p === 'fetching' ? 'ready' : p));
    } catch (e) {
      if (fetchedUrl.current !== normalized) return;
      setError(e instanceof ApiError ? e.message : 'Could not fetch that video.');
      setPhase((p) => (p === 'downloading' || p === 'success' ? p : 'error'));
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
        const jobId = await startDownloadJob(url, quality, mode, licenseToken());
        lastJobId.current = jobId;

        unsubscribe.current?.();
        unsubscribe.current = subscribeProgress(jobId, {
          onProgress: setProgress,
          onDone: () => {
            triggerFileDownload(jobId);
            setPhase('success');
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

  const handleRedownload = useCallback(() => {
    if (lastJobId.current) triggerFileDownload(lastJobId.current);
  }, []);

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
  const canDownload = Boolean(info && (phase === 'ready' || phase === 'preview') && !showProUpgrade);

  const view: 'ready' | 'downloading' | 'success' | null =
    phase === 'downloading'
      ? 'downloading'
      : phase === 'success'
        ? 'success'
        : phase === 'ready' || phase === 'preview' || phase === 'error'
          ? 'ready'
          : null;

  return (
    <div className="app-bg min-h-screen text-white">
      <SiteHeader theme={theme} onToggleTheme={onToggleTheme} />

      <main className="mx-auto max-w-5xl px-5">
        <section className="pt-14 sm:pt-24">
          <Hero />
          <div className="mx-auto mt-14 max-w-3xl">
            <UrlInput
              value={url}
              onChange={setUrl}
              status={
                phase === 'fetching' || phase === 'preview'
                  ? 'fetching'
                  : phase === 'downloading'
                    ? 'downloading'
                    : canDownload
                      ? 'ready'
                      : 'idle'
              }
              onDownload={() => handleDownload(selected, codecMode)}
            />
            <div className="mt-7 flex flex-col items-center gap-4">
              <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs font-medium text-white/55">
                <span className="inline-flex items-center gap-1.5">
                  <CheckDot /> Free
                </span>
                <span aria-hidden="true" className="text-white/25">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckDot /> No sign-up
                </span>
                <span aria-hidden="true" className="text-white/25">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <CheckDot /> No watermark
                </span>
              </p>

              <p className="text-center text-xs text-white/45">
                By using ClipVault you accept our{' '}
                <button onClick={() => navigate('/terms')} className="font-medium text-accent-400 transition hover:text-accent-300 hover:underline">
                  Terms of Service
                </button>{' '}
                and{' '}
                <button onClick={() => navigate('/privacy')} className="font-medium text-accent-400 transition hover:text-accent-300 hover:underline">
                  Privacy Policy
                </button>
                .
              </p>

              <span className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white/60">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
                </svg>
                Secure &amp; malware-free · SSL encrypted
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
                  <SuccessState title={info.title} onReset={handleReset} onRedownload={handleRedownload} />
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
                          refining={phase === 'preview'}
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
          </>
        )}
      </main>

      <Footer />

      <div className="pointer-events-none fixed -left-32 top-1/3 -z-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none fixed -right-24 top-20 -z-10 h-64 w-64 rounded-full bg-blue-500/15 blur-3xl" aria-hidden="true" />

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
