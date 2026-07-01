import { motion } from 'framer-motion';
import { PlatformIcon } from './PlatformIcon';

/** Decorative social icons shown under the headline. Keep in sync with the
 * platforms actually supported by `utils/platform.ts` — do not advertise a
 * platform the URL detector can't handle. */
const SOCIALS = [
  { id: 'youtube' as const, label: 'YouTube' },
  { id: 'facebook' as const, label: 'Facebook' },
  { id: 'instagram' as const, label: 'Instagram' },
];

const CORE_FEATURES = [
  {
    title: 'Download full video',
    body: 'Save the entire video as a ready-to-play MP4 — up to 4K, always with sound.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
      </svg>
    ),
  },
  {
    title: 'Clip any section',
    body: 'Set start and end times to trim just the part you need — highlights, quotes, or reels.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h4v10H4zM16 7h4v10h-4z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h8" />
      </svg>
    ),
  },
] as const;

/** Headline + value props above the URL input. */
export function Hero() {
  return (
    <div className="mx-auto max-w-5xl text-center">
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05 }}
        className="text-[clamp(1.9rem,6.3vw,3.6rem)] font-bold leading-[1.15] tracking-tight text-slate-900"
      >
        Best <span className="gradient-text">Free Online</span> Video Downloader
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.12 }}
        className="mx-auto mt-9 grid max-w-3xl gap-3 sm:grid-cols-2 sm:gap-4"
      >
        {CORE_FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="glass rounded-2xl p-4 text-left sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-gradient text-white shadow-glow-soft">
                {feature.icon}
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 sm:text-base">{feature.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{feature.body}</p>
              </div>
            </div>
          </div>
        ))}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="mt-9 flex flex-wrap items-center justify-center gap-2.5"
      >
        {SOCIALS.map((s) => (
          <span
            key={s.id}
            className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-700"
          >
            <PlatformIcon platform={s.id} className="h-5 w-5" />
            {s.label}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
