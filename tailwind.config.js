/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#10110F',
        surface: {
          DEFAULT: '#161715',
          elevated: '#1C1D1A',
          subtle: '#232521',
        },
        border: {
          subtle: '#242622',
          DEFAULT: '#2E302B',
          strong: '#3F423C',
        },
        primary: {
          DEFAULT: '#F2F1EB',
          muted: '#C8C7BF',
        },
        secondary: {
          DEFAULT: '#92938C',
          muted: '#686963',
        },
        accent: {
          DEFAULT: '#C4F45D',
          hover: '#B5E84C',
          subtle: 'rgba(196, 244, 93, 0.1)',
          border: 'rgba(196, 244, 93, 0.25)',
        },
        status: {
          increased: '#F87171',
          decreased: '#4ADE80',
          added: '#60A5FA',
          removed: '#F43F5E',
          unchanged: '#94A3B8',
          verified: '#4ADE80',
          outdated: '#FBBF24',
          contradicted: '#F87171',
          unverified: '#A855F7',
          unknown: '#92938C',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}

