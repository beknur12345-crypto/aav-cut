import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef6ff', 100: '#d9eaff', 500: '#2f6fde', 600: '#2459bd', 700: '#1d4797', 900: '#132c5c' },
        wood: { 100: '#f6ead7', 300: '#e2c08d', 500: '#c08a3e' },
      },
      fontFamily: { sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
