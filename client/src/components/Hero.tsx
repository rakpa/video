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

/** Headline + social proof above the URL input. */
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
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
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
