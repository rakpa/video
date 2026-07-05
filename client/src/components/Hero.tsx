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
    body: 'Full MP4, up to 4K, with sound.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
      </svg>
    ),
  },
  {
    title: 'Clip any section',
    body: 'Trim to the exact clip you want.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h4v10H4zM16 7h4v10h-4z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h8" />
      </svg>
    ),
  },
] as const;

/** Main headline — URL input is inserted after this on mobile (see App.tsx). */
export function HeroTitle() {
  return (
    <motion.h1
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.05 }}
      className="mx-auto max-w-5xl text-center text-[clamp(1.9rem,6.3vw,3.6rem)] font-bold leading-[1.15] tracking-tight text-slate-900"
    >
      Best <span className="gradient-text">Free Online</span> Video Downloader
    </motion.h1>
  );
}

/** Supported platforms — shown next to the URL input. */
export function HeroPlatforms() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="mb-4 flex flex-col items-center gap-2.5 sm:mb-5"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Works with</span>
      <div className="flex flex-nowrap items-center justify-center gap-1.5 sm:gap-2">
        {SOCIALS.map((s) => (
          <span
            key={s.id}
            className="glass inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-slate-700"
          >
            <PlatformIcon platform={s.id} className="h-4 w-4 sm:h-5 sm:w-5" />
            {s.label}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

/** Feature cards. */
export function HeroFeatures() {
  return (
    <div className="mx-auto max-w-5xl text-center">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.12 }}
        className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-2 sm:gap-4"
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
    </div>
  );
}
