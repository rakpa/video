import { motion, type HTMLMotionProps } from 'framer-motion';

type Variant = 'primary' | 'ghost' | 'upgrade';
type Size = 'md' | 'lg';

interface Props extends HTMLMotionProps<'button'> {
  variant?: Variant;
  size?: Size;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'btn-gradient text-white shadow-glow-soft hover:shadow-glow',
  ghost: 'glass text-slate-700 hover:text-slate-900',
  upgrade: 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-glow-soft hover:shadow-glow',
};

const SIZES: Record<Size, string> = {
  md: 'rounded-2xl px-6 py-3 text-sm font-semibold',
  lg: 'rounded-2xl px-8 py-4 text-lg font-semibold',
};

/**
 * Shared CTA button. Consolidates the gradient/ghost/upgrade button styles that
 * were previously re-implemented across SuccessState, ProUpgradePanel, and the
 * pricing/legal pages. (The URL-bar pill and the ripple button stay bespoke —
 * their geometry is intentionally special.)
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}: Props) {
  return (
    <motion.button
      type="button"
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.2 }}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2 transition-shadow disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        className,
      ].join(' ')}
      {...props}
    />
  );
}
