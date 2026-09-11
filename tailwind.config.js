/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary accent — clean slate-blue
        primary: {
          50:  '#f0f4ff',
          100: '#e0e9ff',
          200: '#c0d0fe',
          300: '#93adfd',
          400: '#6385fa',
          500: '#3d5ef6',
          600: '#2643eb',
          700: '#1e33d0',
          800: '#1e2da9',
          900: '#1e2b85',
          950: '#151a54',
        },
        // Sidebar uses deep navy
        nav: {
          900: '#0f172a',
          800: '#1e293b',
          700: '#334155',
          600: '#475569',
          400: '#94a3b8',
          300: '#cbd5e1',
        },
        // Brand green kept for payroll/HR accents only
        brand: {
          50:  '#f0faf4',
          100: '#dcf5e7',
          500: '#16a34a',
          600: '#15803d',
          700: '#166534',
        },
        gold: {
          400: '#d97706',
          500: '#b45309',
        },
      },
    },
  },
  plugins: [],
};
