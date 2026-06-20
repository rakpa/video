/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Aptos', 'Segoe UI', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'sans-serif'],
      },
      /* Each named size is one Tailwind step larger than default (xs→sm, sm→base, …). */
      fontSize: {
        xs: ['0.875rem', { lineHeight: '1.25rem' }],
        sm: ['1rem', { lineHeight: '1.5rem' }],
        base: ['1.125rem', { lineHeight: '1.75rem' }],
        lg: ['1.25rem', { lineHeight: '1.75rem' }],
        xl: ['1.5rem', { lineHeight: '2rem' }],
        '2xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '3xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '4xl': ['3rem', { lineHeight: '1.1' }],
        '5xl': ['3.75rem', { lineHeight: '1.1' }],
        '6xl': ['4.5rem', { lineHeight: '1' }],
        '7xl': ['5.25rem', { lineHeight: '1' }],
        '8xl': ['6.75rem', { lineHeight: '1' }],
        '9xl': ['8.5rem', { lineHeight: '1' }],
      },
      colors: {
        ink: {
          950: '#070710',
          900: '#0b0b16',
          800: '#12121f',
          700: '#1b1b2e',
        },
        accent: {
          DEFAULT: '#4f46e5',
          400: '#6366f1',
          500: '#4f46e5',
          600: '#4338ca',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(79,70,229,0.18), 0 16px 40px -16px rgba(79,70,229,0.35)',
        'glow-soft': '0 10px 30px -14px rgba(79,70,229,0.30)',
        card: '0 1px 2px rgba(2,6,23,0.04), 0 18px 50px -24px rgba(2,6,23,0.18)',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(120deg, #4f46e5 0%, #7c3aed 100%)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'gradient-pan': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'gradient-pan': 'gradient-pan 6s ease infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
