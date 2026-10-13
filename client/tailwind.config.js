/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b1f2b',
        paper: 'transparent',
        panel: 'rgba(255,255,255,0.07)',
        tx: '#e8f6fa',
        mu: '#9bbcc8',
        amber: { DEFAULT: '#ffb347', dark: '#e8982a' },
        brand: { DEFAULT: '#3fd0e8', dark: '#2bb8d1' },
        teal: '#a78bfa',
        good: '#4ade80',
        warn: '#ffb347',
        bad: '#fb7185',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        card: '0 10px 40px rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.18)',
      },
    },
  },
  plugins: [],
};
