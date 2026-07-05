import { motion } from 'framer-motion';

const STEPS = [
  {
    title: 'Paste a link',
    body: 'Copy any video URL from YouTube, Facebook, or Instagram and drop it in the bar.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <rect x="8" y="4" width="8" height="4" rx="1" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 6h2a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
      </svg>
    ),
  },
  {
    title: 'Pick your quality',
    body: 'Choose HD, 2K, or 4K. Audio is always merged in — no silent clips, ever.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.3 7.2 18.7l.9-5.4L4.2 9.5l5.4-.8L12 3Z" />
      </svg>
    ),
  },
  {
    title: 'Download',
    body: 'Get a ready-to-play MP4 saved straight to your device. No app, no sign-up.',
    icon: (
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />
      </svg>
    ),
  },
];

/** Three-step explainer beneath the hero. */
export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto mt-24 max-w-4xl scroll-mt-8">
      <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
        How it works
      </h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm text-slate-600">
        Three steps, about ten seconds. No account required.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <motion.div
            key={s.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="glass relative rounded-3xl p-6"
          >
            <span className="absolute right-5 top-5 text-5xl font-black leading-none text-slate-300">
              {i + 1}
            </span>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-gradient text-white shadow-glow-soft">
              {s.icon}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">{s.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.body}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
