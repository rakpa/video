import { motion } from 'framer-motion';
import { PlatformIcon } from './PlatformIcon';

/** Decorative social icons shown under the headline. */
const SOCIALS = [
  { id: 'youtube' as const, label: 'YouTube' },
  { id: 'facebook' as const, label: 'Facebook' },
  { id: 'instagram' as const, label: 'Instagram' },
];

function TikTokIcon({ className = 'h-6 w-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.5 3c.3 2.3 1.9 4 4.5 4.2v3c-1.6.1-3.1-.4-4.5-1.3v6.1a5.9 5.9 0 1 1-6-5.9c.3 0 .6 0 .9.1v3.1a2.9 2.9 0 1 0 2.1 2.8V3h3Z" />
    </svg>
  );
}

/** Headline + social proof above the URL input. */
export function Hero() {
  return (
    <div className="mx-auto max-w-5xl text-center">
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05 }}
        className="text-[clamp(1.85rem,6.2vw,3.5rem)] font-bold leading-[1.15] tracking-tight text-slate-900"
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
        <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-700">
          <TikTokIcon className="h-5 w-5 text-slate-900" />
          TikTok
        </span>
      </motion.div>
    </div>
  );
}
