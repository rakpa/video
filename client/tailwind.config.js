/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          950: '#070710',
          900: '#0b0b16',
          800: '#12121f',
          700: '#1b1b2e',
        },
        accent: {
          DEFAULT: '#7c5cff',
          400: '#9b7cff',
          500: '#7c5cff',
          600: '#6a3dff',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(124,92,255,0.35), 0 12px 40px -8px rgba(124,92,255,0.5)',
        'glow-soft': '0 8px 30px -8px rgba(124,92,255,0.35)',
        card: '0 20px 60px -20px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'accent-gradient': 'linear-gradient(120deg, #7c5cff 0%, #c44bff 50%, #4b9bff 100%)',
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
