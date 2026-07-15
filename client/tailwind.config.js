/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
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
