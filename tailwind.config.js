/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src-vis/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        app: {
          bg: 'var(--app-bg)',
          surface: 'var(--app-surface)',
          border: 'var(--app-border)',
        },
        widget: {
          bg: 'var(--widget-bg)',
          border: 'var(--widget-border)',
        },
        tx: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          green: 'var(--accent-green)',
          yellow: 'var(--accent-yellow)',
          red: 'var(--accent-red)',
        },
      },
      borderRadius: {
        widget: 'var(--widget-radius)',
      },
      boxShadow: {
        widget: 'var(--widget-shadow)',
      },
    },
  },
  plugins: [],
};
