import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export interface FaqItem {
  q: string;
  a: string;
}

interface Props {
  items: FaqItem[];
  title?: string;
  subtitle?: string;
}

/** Accessible accordion FAQ, reused on the home and pricing pages. */
export function Faq({ items, title = 'Frequently asked questions', subtitle }: Props) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section className="mx-auto mt-24 max-w-3xl">
      <h2 className="text-center text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
      {subtitle && <p className="mx-auto mt-2 max-w-md text-center text-sm text-white/60">{subtitle}</p>}

      <div className="mt-10 space-y-3">
        {items.map((item, i) => {
          const isOpen = open === i;
          return (
            <div key={item.q} className="glass overflow-hidden rounded-2xl">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-semibold text-white">{item.q}</span>
                <motion.span
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/5 text-white/70"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                  </svg>
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="px-5 pb-5 text-sm leading-relaxed text-white/65">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
