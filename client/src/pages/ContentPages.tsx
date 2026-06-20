import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { COMPANY } from '../config/company';
import { navigate } from '../hooks/useRoute';
import { SiteHeader } from '../components/SiteHeader';
import { Button } from '../components/Button';
import { useDocumentMeta } from '../hooks/useDocumentMeta';
import type { Theme } from '../hooks/useTheme';

/* ----------------------------------------------------------------------------
 * Original, long-form help/SEO content pages. These mirror the LegalPages shell
 * (SiteHeader + glass article + shared prose primitives + back link + cross-nav)
 * and are wired into the router and footer. Every page below is hand-written,
 * substantial prose — how-tos, tips, and FAQs — intended to be genuinely useful
 * to readers (and to satisfy search engines and ad-network content reviews).
 * ------------------------------------------------------------------------- */

interface ContentRoute {
  title: string;
  description: string;
  render: () => ReactNode;
}

/** All content routes, used by the router, the footer, and the sitemap. */
export const CONTENT_ROUTES: Record<string, ContentRoute> = {
  '/download-youtube-videos': {
    title: 'YouTube Video Downloader',
    description:
      'Download YouTube videos in HD 720p, Full HD 1080p, 2K and 4K with sound. A step-by-step guide, supported formats, quality tips and a short FAQ.',
    render: YouTubeGuide,
  },
  '/download-facebook-videos': {
    title: 'Facebook Video Downloader',
    description:
      'How to download Facebook videos and Reels to your device in high quality. Step-by-step instructions, public vs. private notes, and answers to common questions.',
    render: FacebookGuide,
  },
  '/download-instagram-videos': {
    title: 'Instagram Video Downloader',
    description:
      'Save Instagram Reels and videos in their original quality. Simple step-by-step instructions, useful tips, and a quick FAQ.',
    render: InstagramGuide,
  },
  '/how-to-download-videos': {
    title: 'How to Download Videos: The Complete Guide',
    description:
      'A plain-English guide to downloading online videos safely and legally — quality and format basics, a universal 3-step method, and troubleshooting tips.',
    render: HowToGuide,
  },
  '/about': {
    title: `About ${COMPANY.brand}`,
    description: `Learn about ${COMPANY.brand} — our mission, what the tool does, why it is free to use, and how our no-storage approach protects your privacy.`,
    render: AboutPage,
  },
  '/contact': {
    title: 'Contact Us',
    description: `Get in touch with the ${COMPANY.brand} team. Email us for support, feedback, billing questions, or copyright matters.`,
    render: ContactPage,
  },
};

/** Ordered links for the cross-nav at the bottom of each content page. */
export const CONTENT_LINKS = [
  { path: '/how-to-download-videos', label: 'How to download' },
  { path: '/download-youtube-videos', label: 'YouTube' },
  { path: '/download-facebook-videos', label: 'Facebook' },
  { path: '/download-instagram-videos', label: 'Instagram' },
  { path: '/about', label: 'About' },
  { path: '/contact', label: 'Contact' },
];

interface Props {
  path: string;
  theme: Theme;
  onToggleTheme: () => void;
}

/** Full-page content shell with header, prose article, and cross-link nav. */
export function ContentPage({ path, theme, onToggleTheme }: Props) {
  const route = CONTENT_ROUTES[path];
  useDocumentMeta({
    title: route?.title ?? 'Not found',
    description: route?.description ?? '',
  });

  if (!route) return <NotFound />;

  return (
    <div className="app-bg min-h-screen text-slate-600">
      <SiteHeader theme={theme} onToggleTheme={onToggleTheme} maxWidth="max-w-5xl" />

      <main className="mx-auto max-w-3xl px-5 pb-20">
        <motion.article
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="glass rounded-3xl p-6 shadow-card sm:p-10"
        >
          <button
            onClick={() => navigate('/')}
            className="mb-6 inline-flex items-center gap-1.5 text-sm text-indigo-600 transition hover:text-indigo-700"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" />
            </svg>
            Back to app
          </button>

          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">{route.title}</h1>

          <div className="mt-6 space-y-6 text-base leading-relaxed text-slate-600">
            <p className="text-slate-500">{route.description}</p>
            {route.render()}
          </div>

          <div className="mt-10 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
            <p className="font-semibold text-slate-900">Ready to try it?</p>
            <p className="mt-1 text-sm text-slate-600">
              Paste any supported link and {COMPANY.brand} does the rest — free, with sound, no sign-up.
            </p>
            <Button onClick={() => navigate('/')} className="mt-4">
              Open the downloader
            </Button>
          </div>
        </motion.article>

        {/* Cross-links between content pages */}
        <nav className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-slate-500">
          {CONTENT_LINKS.map((l) => (
            <ContentLink key={l.path} to={l.path} active={l.path === path}>
              {l.label}
            </ContentLink>
          ))}
        </nav>
      </main>
    </div>
  );
}

/* ------------------------------- primitives ------------------------------- */

function H2({ children }: { children: ReactNode }) {
  return <h2 className="pt-2 text-xl font-bold text-slate-900">{children}</h2>;
}
function H3({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-semibold text-slate-900">{children}</h3>;
}
function P({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}
function UL({ children }: { children: ReactNode }) {
  return <ul className="ml-5 list-disc space-y-2 marker:text-indigo-500">{children}</ul>;
}
function OL({ children }: { children: ReactNode }) {
  return <ol className="ml-5 list-decimal space-y-2 marker:font-semibold marker:text-indigo-500">{children}</ol>;
}
function Strong({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>;
}
function Faq({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>;
}
function QA({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div>
      <H3>{q}</H3>
      <p className="mt-1">{children}</p>
    </div>
  );
}
function ContentLink({ to, active, children }: { to: string; active?: boolean; children: ReactNode }) {
  return (
    <button
      onClick={() => navigate(to)}
      className={active ? 'font-medium text-indigo-600' : 'transition hover:text-slate-900'}
    >
      {children}
    </button>
  );
}

function NotFound() {
  return (
    <div className="app-bg grid min-h-screen place-items-center px-5 text-center text-slate-600">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
        <Button onClick={() => navigate('/')} className="mt-5">
          Back to {COMPANY.brand}
        </Button>
      </div>
    </div>
  );
}

/* =============================== PAGES =============================== */

function YouTubeGuide() {
  return (
    <>
      <P>
        YouTube is the largest video library on the planet, and there are plenty of legitimate reasons to keep an
        offline copy of a clip: saving your own uploads, archiving a tutorial you rely on, watching a lecture on a long
        flight, or pulling reference footage you have the rights to use. {COMPANY.brand} makes this simple. Paste a
        YouTube link and we extract the best available video and audio streams, merge them into a single, ready-to-play
        MP4, and hand you the file — no software to install and no watermark added.
      </P>

      <H2>How to download a YouTube video</H2>
      <OL>
        <li>
          Open YouTube, find the video you want, and copy its link. On desktop, copy the URL from the address bar; on
          mobile, tap <Strong>Share → Copy link</Strong>.
        </li>
        <li>
          Come back to {COMPANY.brand} and paste the link into the box on the home page. We detect that it is a YouTube
          URL automatically.
        </li>
        <li>
          Wait a moment while we read the video. A preview card appears with the title, channel, and a list of
          available qualities.
        </li>
        <li>
          Choose the resolution you want — for example <Strong>1080p</Strong> for crisp Full HD, or 2K / 4K if the
          source offers it — then press <Strong>Download</Strong>.
        </li>
        <li>The finished MP4 saves straight to your device, with the audio already merged in.</li>
      </OL>

      <H2>Supported qualities and formats</H2>
      <P>
        The qualities you see depend on what the original uploader provided. YouTube stores high-resolution video and
        audio as separate streams, so a naïve "grab the video file" approach often produces a silent clip.{' '}
        {COMPANY.brand} avoids that by always pairing the chosen video stream with the best matching audio and
        muxing them together.
      </P>
      <UL>
        <li>
          <Strong>720p (HD)</Strong> — light files that look great on phones and tablets.
        </li>
        <li>
          <Strong>1080p (Full HD)</Strong> — the sweet spot for most laptops and TVs; free on {COMPANY.brand}.
        </li>
        <li>
          <Strong>1440p (2K) and 2160p (4K)</Strong> — maximum detail when the original was filmed in high resolution.
        </li>
        <li>
          <Strong>MP3 audio</Strong> — extract just the soundtrack of a video, ideal for music you own or podcasts.
        </li>
      </UL>

      <H2>Tips for the best results</H2>
      <UL>
        <li>
          If 4K is not listed, the original simply was not uploaded in 4K — you can only download what exists at the
          source.
        </li>
        <li>
          For the smallest file that still looks sharp on a phone, pick 720p. For archiving, pick the highest available
          resolution.
        </li>
        <li>Make sure you copied the full link, including the part after the question mark, so we open the right video.</li>
        <li>Very long videos take a little longer to process because there is simply more data to fetch and merge.</li>
      </UL>

      <H2>Is it legal to download YouTube videos?</H2>
      <P>
        Downloading is appropriate when you own the content, have the creator's permission, or the material is in the
        public domain or licensed for reuse. It is your responsibility to respect copyright and YouTube's Terms of
        Service. {COMPANY.brand} is a neutral tool for personal, lawful use; we do not host or index any video, and we
        do not store the files we process for you.
      </P>

      <H2>Frequently asked questions</H2>
      <Faq>
        <QA q="Will the download include sound?">
          Yes — always. We merge the video and audio streams server-side, so you never end up with a silent file.
        </QA>
        <QA q="Do I need an account or app?">
          No. {COMPANY.brand} runs entirely in your browser. There is nothing to install and no sign-up to download in
          standard quality.
        </QA>
        <QA q="Can I download 4K from YouTube?">
          Yes, when the original video was uploaded in 4K. If only lower resolutions are listed, that is the highest the
          source offers.
        </QA>
        <QA q="Are my downloads private?">
          We process your file only long enough to deliver it, then delete it automatically. We do not keep a history of
          what you download.
        </QA>
      </Faq>
    </>
  );
}

function FacebookGuide() {
  return (
    <>
      <P>
        Facebook is full of video worth keeping — your own posts, clips from a page you manage, family memories shared
        in a group, or Reels you want to rewatch offline. The catch is that Facebook does not offer a built-in "save to
        device" button for most videos. {COMPANY.brand} fills that gap: paste a Facebook video or Reel link and we
        return a clean MP4 with the sound intact, ready to play anywhere.
      </P>

      <H2>How to download a Facebook video</H2>
      <OL>
        <li>
          Find the video on Facebook. Click the three-dot menu (or tap the share icon) and choose{' '}
          <Strong>Copy link</Strong>. For Reels, use the share button and copy the link the same way.
        </li>
        <li>Open {COMPANY.brand} and paste the link into the box on the home page.</li>
        <li>
          We read the post and show a preview card with the available download options. Pick the quality you want.
        </li>
        <li>
          Press <Strong>Download</Strong> and the MP4 saves to your device, audio included.
        </li>
      </OL>

      <H2>Public vs. private videos</H2>
      <P>
        This is the most important thing to understand about Facebook downloads.
      </P>
      <UL>
        <li>
          <Strong>Public videos</Strong> — posts set so that "anyone" can view them work reliably, because the file is
          openly reachable from the link.
        </li>
        <li>
          <Strong>Private or friends-only videos</Strong> — content locked behind privacy settings, a login, or a
          closed group generally cannot be fetched from a plain link, and {COMPANY.brand} will not bypass those
          protections. If the video is yours, the simplest path is to change its audience to public temporarily, or
          download your own content through Facebook's own data-export tools.
        </li>
      </UL>
      <P>
        Always make sure you have the right to save a clip — your own videos, content you have permission to keep, or
        material that is openly licensed.
      </P>

      <H2>Tips</H2>
      <UL>
        <li>Use the "Copy link" option rather than copying text from the address bar, which sometimes points to a feed instead of the specific video.</li>
        <li>If a link fails, open the video on its own page first, then copy the link from there.</li>
        <li>Watch quality depends on how the uploader posted it — we can only deliver what Facebook stored.</li>
      </UL>

      <H2>Frequently asked questions</H2>
      <Faq>
        <QA q="Can I download Facebook Reels?">
          Yes. Reels work the same way as regular videos — copy the Reel's share link and paste it into {COMPANY.brand}.
        </QA>
        <QA q="Why won't my video download?">
          The most common reason is privacy: if the post is private, friends-only, or inside a closed group, the link is
          not openly accessible and cannot be fetched.
        </QA>
        <QA q="Will there be a watermark?">
          No. {COMPANY.brand} does not add any watermark or branding to your file.
        </QA>
        <QA q="Is it free?">
          Yes — downloading Facebook videos in standard quality is free, with no account required.
        </QA>
      </Faq>
    </>
  );
}

function InstagramGuide() {
  return (
    <>
      <P>
        Instagram Reels and feed videos are easy to enjoy in the app but awkward to keep. There is no native download
        button, and screen-recording produces a low-quality clip cluttered with the interface. {COMPANY.brand} gives you
        the actual video file at its original quality — paste an Instagram link and download a clean MP4 with sound.
      </P>

      <H2>How to download an Instagram Reel or video</H2>
      <OL>
        <li>
          Open the Reel or video in the Instagram app or on the web. Tap the <Strong>share</Strong> icon (the paper
          aeroplane) and choose <Strong>Copy link</Strong>.
        </li>
        <li>Switch to {COMPANY.brand} and paste the link into the box on the home page.</li>
        <li>We load the post and show a preview with the available quality options.</li>
        <li>
          Tap <Strong>Download</Strong> and your MP4 is saved, with the audio included.
        </li>
      </OL>

      <H2>What you can download</H2>
      <UL>
        <li>
          <Strong>Reels</Strong> — short-form vertical videos, the most popular thing people save.
        </li>
        <li>
          <Strong>Feed videos</Strong> — standard video posts in the main timeline.
        </li>
        <li>
          <Strong>Public accounts</Strong> — content from open profiles is reachable from a link. Posts from private
          accounts you do not follow are protected and cannot be fetched.
        </li>
      </UL>

      <H2>Tips for a smooth download</H2>
      <UL>
        <li>Always use "Copy link" from the share menu rather than copying text — it gives the exact post URL.</li>
        <li>If a post has several clips in a carousel, open the specific one you want before copying the link.</li>
        <li>Save content you created or have permission to keep, and credit creators when you reshare.</li>
      </UL>

      <H2>Frequently asked questions</H2>
      <Faq>
        <QA q="Can I download Instagram Reels with sound?">
          Yes. The audio is merged into the file, so your saved Reel plays with its original soundtrack.
        </QA>
        <QA q="Does Instagram notify the creator?">
          No. Using {COMPANY.brand} does not tell the original poster that you saved their video.
        </QA>
        <QA q="Can I download from private accounts?">
          No. Content from private profiles you do not follow is protected, and {COMPANY.brand} will not bypass those
          restrictions.
        </QA>
        <QA q="Is there a watermark?">
          No watermark is added by {COMPANY.brand}. You get the underlying video as stored on Instagram.
        </QA>
      </Faq>
    </>
  );
}

function HowToGuide() {
  return (
    <>
      <P>
        Saving an online video for offline viewing sounds technical, but the basics are simple once you understand a
        few ideas about quality and file formats. This guide explains everything in plain English and walks you through
        a universal method that works for YouTube, Facebook, and Instagram with {COMPANY.brand}.
      </P>

      <H2>The universal 3-step method</H2>
      <OL>
        <li>
          <Strong>Copy the video link.</Strong> On any platform, look for a share option and choose "Copy link". This
          gives you the exact URL of the video, which is what the downloader needs.
        </li>
        <li>
          <Strong>Paste it into {COMPANY.brand}.</Strong> Drop the link into the box on the home page. We automatically
          recognise which platform it came from and read the available qualities.
        </li>
        <li>
          <Strong>Pick a quality and download.</Strong> Choose a resolution, press Download, and the merged MP4 (video
          plus sound) saves to your device.
        </li>
      </OL>

      <H2>Understanding video quality</H2>
      <P>
        Resolution describes how many pixels make up the picture. More pixels mean a sharper image and a larger file.
        Here is how the common options compare:
      </P>
      <UL>
        <li>
          <Strong>720p (HD)</Strong> — perfectly clear on phones; smallest files.
        </li>
        <li>
          <Strong>1080p (Full HD)</Strong> — the most popular choice; looks great on laptops and TVs.
        </li>
        <li>
          <Strong>1440p (2K)</Strong> — extra crispness on larger screens.
        </li>
        <li>
          <Strong>2160p (4K)</Strong> — maximum detail, best for big TVs and archiving; biggest files.
        </li>
      </UL>
      <P>
        You can only download a quality that the original uploader actually provided. If 4K is not offered, the source
        was not published in 4K.
      </P>

      <H2>Understanding file formats</H2>
      <P>
        <Strong>MP4</Strong> is the universal video format — it plays on virtually every phone, computer, and TV, which
        is why {COMPANY.brand} delivers MP4 by default. If you only want the sound (for music you own or a podcast), an{' '}
        <Strong>MP3</Strong> audio file strips out the video and keeps just the audio track.
      </P>

      <H2>Why sound sometimes goes missing elsewhere</H2>
      <P>
        Many platforms store high-resolution video and its audio as two separate streams. Tools that simply grab "the
        video file" can hand you a silent clip. {COMPANY.brand} always pairs the video with its matching audio and
        merges them, so your download plays with sound the first time.
      </P>

      <H2>Troubleshooting</H2>
      <UL>
        <li>
          <Strong>The link won't load:</Strong> make sure you copied the full URL via the share menu, not partial text.
        </li>
        <li>
          <Strong>A quality is missing:</Strong> that resolution was not available at the source.
        </li>
        <li>
          <Strong>Nothing happens for private content:</Strong> private, friends-only, or login-required videos are
          protected and cannot be fetched from a plain link.
        </li>
        <li>
          <Strong>A long video is slow:</Strong> larger videos contain more data to fetch and merge — give it a moment.
        </li>
      </UL>

      <H2>Download responsibly</H2>
      <P>
        Only download content you own, have permission to keep, or that is openly licensed. Respect each platform's
        Terms of Service and the rights of creators. {COMPANY.brand} is a tool for personal, lawful use and does not
        store the files it processes.
      </P>

      <H2>Frequently asked questions</H2>
      <Faq>
        <QA q="Which sites are supported?">
          YouTube, Facebook, and Instagram. Paste any standard video link and we detect the platform automatically.
        </QA>
        <QA q="Do I need to install anything?">
          No. Everything runs in your browser — no app, no extension, no account for standard downloads.
        </QA>
        <QA q="Which format should I choose?">
          MP4 for video (it plays everywhere). Choose MP3 if you only want the audio.
        </QA>
        <QA q="Is it really free?">
          Yes. Downloads up to 1080p with sound are free. Pro unlocks 2K, 4K, MP3 extraction, and unlimited downloads.
        </QA>
      </Faq>
    </>
  );
}

function AboutPage() {
  return (
    <>
      <P>
        {COMPANY.brand} is a fast, clean video downloader for YouTube, Facebook, and Instagram. We built it because the
        existing tools were either cluttered with ads and fake buttons, delivered silent files, or buried simple tasks
        behind sign-ups and installs. Our goal is the opposite: paste a link, pick a quality, get a ready-to-play file —
        with the sound already merged in and nothing extra to click.
      </P>

      <H2>Our mission</H2>
      <P>
        We want downloading a video to feel effortless and trustworthy. That means a clean interface, honest behaviour
        (no surprise redirects or bundled software), reliable output, and clear guidance about using the tool
        responsibly. People should be able to keep an offline copy of content they own or have the right to use without
        wrestling with confusing software.
      </P>

      <H2>What {COMPANY.brand} does</H2>
      <UL>
        <li>Detects the platform automatically from the link you paste.</li>
        <li>Extracts the best available video and audio and merges them into a single MP4.</li>
        <li>Supports resolutions from 720p up to 4K, depending on the source.</li>
        <li>Can extract MP3 audio when you only want the soundtrack.</li>
        <li>Adds no watermark and bundles no extra software.</li>
      </UL>

      <H2>Why it's free</H2>
      <P>
        Standard downloads — up to 1080p with sound, with no account — are free, and we intend to keep them that way.
        The service is supported by an optional Pro upgrade (which unlocks 2K, 4K, MP3 extraction, unlimited downloads,
        and priority processing) and by advertising. Keeping the core free means anyone can save the content they are
        entitled to keep without a paywall.
      </P>

      <H2>Privacy and our no-storage stance</H2>
      <P>
        We are deliberately minimal with data. When you request a download, we process the media only for the moment
        needed to deliver it to your device, stream it to you, and then <Strong>delete it automatically</Strong>. We do
        not host, index, or archive any third-party video, and we do not build a profile of what you download. The tool
        acts only at your direction, on links you choose to provide.
      </P>

      <H2>Responsible use</H2>
      <P>
        {COMPANY.brand} is independent and is not affiliated with, sponsored by, or endorsed by YouTube, Google, Meta,
        Facebook, or Instagram. We ask every user to download only content they own or are permitted to keep, and to
        respect copyright and each platform's Terms of Service. You can read more in our Terms of Service and Privacy
        Policy, linked in the footer.
      </P>

      <H2>Get in touch</H2>
      <P>
        Questions, feedback, or ideas? We genuinely like hearing from people who use {COMPANY.brand}. Email us at{' '}
        <Strong>{COMPANY.contactEmail}</Strong> or visit the contact page.
      </P>
    </>
  );
}

function ContactPage() {
  return (
    <>
      <P>
        We're happy to help. Whether you have a question about a download, feedback on the product, a billing query, or
        a copyright matter, the fastest way to reach the {COMPANY.brand} team is by email. We read every message and aim
        to reply within a couple of business days.
      </P>

      <H2>Email us</H2>
      <P>
        For general support, feedback, and account or billing questions, write to us at:
      </P>
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
        <p className="text-sm text-slate-600">General support</p>
        <a
          href={`mailto:${COMPANY.contactEmail}`}
          className="mt-0.5 inline-block text-lg font-semibold text-indigo-600 transition hover:text-indigo-700"
        >
          {COMPANY.contactEmail}
        </a>
      </div>
      <P>
        For copyright notices and DMCA takedown requests, please use our dedicated address so your message reaches the
        right person:
      </P>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm text-slate-600">Copyright / DMCA</p>
        <a
          href={`mailto:${COMPANY.dmcaEmail}`}
          className="mt-0.5 inline-block text-lg font-semibold text-slate-900 transition hover:text-indigo-700"
        >
          {COMPANY.dmcaEmail}
        </a>
      </div>

      <H2>Before you write</H2>
      <P>
        Many common questions are already answered in our guides, which may save you a round-trip:
      </P>
      <UL>
        <li>
          Trouble with a specific platform? See our{' '}
          <button onClick={() => navigate('/download-youtube-videos')} className="font-medium text-indigo-600 hover:underline">
            YouTube
          </button>
          ,{' '}
          <button onClick={() => navigate('/download-facebook-videos')} className="font-medium text-indigo-600 hover:underline">
            Facebook
          </button>
          , and{' '}
          <button onClick={() => navigate('/download-instagram-videos')} className="font-medium text-indigo-600 hover:underline">
            Instagram
          </button>{' '}
          guides.
        </li>
        <li>
          New to downloading? Start with{' '}
          <button onClick={() => navigate('/how-to-download-videos')} className="font-medium text-indigo-600 hover:underline">
            How to download videos
          </button>
          .
        </li>
        <li>Billing or refunds? See our Refund &amp; Subscription Policy in the footer.</li>
      </UL>
      <P>
        When you do email, please include the link you were trying to download (if relevant) and a short description of
        what happened — it helps us help you faster.
      </P>

      <H2>Help us improve</H2>
      <P>
        {COMPANY.brand} gets better because of the people who use it. If a download didn't work, a quality you needed
        was missing, or you have an idea for a feature, tell us. Real feedback directly shapes what we build next.
      </P>
    </>
  );
}
