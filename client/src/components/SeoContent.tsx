import { navigate } from '../hooks/useRoute';
import { HIDE_PRO } from '../config/build';
import { COMPANY } from '../config/company';

/**
 * On-theme, long-form marketing/SEO section for the home page. Original prose
 * describing what VidCliply does, the platforms and qualities it supports, a
 * quick 3-step how-to, reasons to choose it, and a compact FAQ. Rendered in the
 * idle marketing block beneath the existing FAQ accordion.
 */
export function SeoContent() {
  const brand = COMPANY.brand;

  return (
    <section className="mx-auto mt-24 max-w-3xl text-[16px] leading-relaxed text-slate-600">
      <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Download any video, the easy way
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-center text-slate-600">
        {brand} is a free {HIDE_PRO ? '' : 'online '}video downloader for YouTube, Facebook, and Instagram. Paste a link and get a
        clean, ready-to-play MP4 — always with sound, never with a watermark.
      </p>

      <div className="mt-10 space-y-6">
        <p>
          Most "save video" tools fall short in the same ways: they hide the real download behind fake buttons, bundle
          unwanted software, or hand you a silent file because they grabbed the video without its audio. {brand} was
          built to avoid all of that. We detect the platform automatically, fetch the best available video and audio,
          and merge them server-side so your file plays with sound the very first time — on any phone, laptop, or TV.
        </p>

        <div>
          <h3 className="text-lg font-bold text-slate-900">Supported platforms</h3>
          <ul className="ml-5 mt-3 list-disc space-y-2 marker:text-indigo-500">
            <li>
              <strong className="font-semibold text-slate-900">YouTube</strong> — videos, music, and tutorials in HD up
              to {HIDE_PRO ? '1080p' : '4K'}.
            </li>
            <li>
              <strong className="font-semibold text-slate-900">Facebook</strong> — public videos and Reels in high
              quality.
            </li>
            <li>
              <strong className="font-semibold text-slate-900">Instagram</strong> — Reels and feed videos at their
              original quality.
            </li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900">Quality options, from 720p to {HIDE_PRO ? '1080p' : '4K'}</h3>
          <p className="mt-2">
            Choose the resolution that fits your screen and storage. Pick <strong className="font-semibold text-slate-900">720p</strong> for
            light files that look sharp on phones, <strong className="font-semibold text-slate-900">1080p</strong> Full
            HD for the best all-round balance
            {HIDE_PRO ? (
              '.'
            ) : (
              <>
                , or <strong className="font-semibold text-slate-900">2K and 4K</strong> when the source was filmed in
                high resolution and you want maximum detail.
              </>
            )}{' '}
            Every download includes audio, and you can also save just the sound as an{' '}
            <strong className="font-semibold text-slate-900">MP3</strong>.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900">How to download a video in 3 steps</h3>
          <ol className="ml-5 mt-3 list-decimal space-y-2 marker:font-semibold marker:text-indigo-500">
            <li>Copy the video's link from YouTube, Facebook, or Instagram using the share menu.</li>
            <li>Paste it into the box at the top of this {HIDE_PRO ? 'screen' : 'page'} — {brand} recognises the platform for you.</li>
            <li>Choose a quality and press Download. Your MP4, with sound, saves straight to your device.</li>
          </ol>
        </div>

        <div>
          <h3 className="text-lg font-bold text-slate-900">Why choose {brand}</h3>
          <ul className="ml-5 mt-3 list-disc space-y-2 marker:text-indigo-500">
            <li>Free to use, with no sign-up required for standard downloads.</li>
            <li>Audio always merged — no silent files.</li>
            <li>No watermarks and no bundled software.</li>
            <li>{HIDE_PRO ? 'Saves straight to your Photos or Files.' : 'Works in your browser on desktop and mobile.'}</li>
            <li>Privacy-first: files are kept only temporarily and then removed.</li>
          </ul>
        </div>

        <p>
          Want a step-by-step walkthrough for a specific platform? Read our guides for{' '}
          <button onClick={() => navigate('/download-youtube-videos')} className="font-medium text-indigo-600 transition hover:text-indigo-700 hover:underline">
            YouTube
          </button>
          ,{' '}
          <button onClick={() => navigate('/download-facebook-videos')} className="font-medium text-indigo-600 transition hover:text-indigo-700 hover:underline">
            Facebook
          </button>
          , and{' '}
          <button onClick={() => navigate('/download-instagram-videos')} className="font-medium text-indigo-600 transition hover:text-indigo-700 hover:underline">
            Instagram
          </button>
          , or start with the{' '}
          <button onClick={() => navigate('/how-to-download-videos')} className="font-medium text-indigo-600 transition hover:text-indigo-700 hover:underline">
            complete how-to guide
          </button>
          .
        </p>
      </div>
    </section>
  );
}
