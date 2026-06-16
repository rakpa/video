import { motion } from 'framer-motion';
import { useMemo } from 'react';

const COLORS = ['#7c5cff', '#c44bff', '#4b9bff', '#34d399', '#fbbf24'];

/**
 * Lightweight confetti burst — pure Framer Motion, no dependency.
 * Renders once on mount; particles fall and fade.
 */
export function Confetti({ count = 60 }: { count?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: (Math.random() - 0.5) * 600,
        rotate: Math.random() * 720 - 360,
        delay: Math.random() * 0.2,
        duration: 1.4 + Math.random() * 1,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
      })),
    [count],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center" aria-hidden="true">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ x: 0, y: -20, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: 400, opacity: 0, rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeOut' }}
          className="absolute rounded-sm"
          style={{ width: p.size, height: p.size * 0.5, background: p.color }}
        />
      ))}
    </div>
  );
}
