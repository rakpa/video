import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface Feature {
  title: string;
  body: string;
  icon: ReactNode;
}

const FEATURES: Feature[] = [
  {
    title: 'Always with sound',
    body: 'Video and audio are merged into one MP4 — never a silent file.',
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path strokeLinecap="round" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" />
      </>
    ),
  },
  {
    title: 'Up to 4K Ultra HD',
    body: 'Grab the highest resolution the source offers — 720p all the way to 4K.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6L5.7 21 8 13.8 2 9.4h7.6L12 3Z" />,
  },
  {
    title: 'No watermarks, ever',
    body: 'Clean files with nothing stamped on top. What you see is what you get.',
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    title: 'Files auto-deleted',
    body: 'We stream your download, then wipe it from our servers. We keep nothing.',
    icon: (
      <>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14M10 11v6m4-6v6" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      </>
    ),
  },
  {
    title: 'No sign-up needed',
    body: 'Paste and go. No account, no email, no friction — just your download.',
    icon: (
      <>
        <circle cx="10" cy="8" r="4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 20a7 7 0 0 1 12-4.9M16 18l2 2 4-4" />
      </>
    ),
  },
  {
    title: 'Blazing fast',
    body: 'Server-side processing and merging means downloads start in seconds.',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" />,
  },
];

/** Six-up feature grid communicating the core value props. */
export function FeatureGrid() {
  return (
    <section id="features" className="mx-auto mt-24 max-w-4xl scroll-mt-8">
      <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        Everything you need, nothing you don't
      </h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-slate-600">
        Built to be the fastest, cleanest way to save a video.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
            className="glass rounded-2xl p-5 transition-colors hover:bg-slate-50"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                {f.icon}
              </svg>
            </div>
            <h3 className="mt-3.5 font-semibold text-slate-900">{f.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{f.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
