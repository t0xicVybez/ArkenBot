/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Driven by CSS-variable RGB triplets so the whole app re-themes by
        // scope: v1 values live on :root (globals.css), v2 values under `.v2`
        // (tokens.v2.css). `<alpha-value>` keeps opacity utilities working
        // (e.g. bg-discord-blurple/20).
        discord: {
          blurple: 'rgb(var(--blurple-rgb) / <alpha-value>)',
          green: 'rgb(var(--green-rgb) / <alpha-value>)',
          yellow: 'rgb(var(--yellow-rgb) / <alpha-value>)',
          red: 'rgb(var(--red-rgb) / <alpha-value>)',
          base: 'rgb(var(--base-rgb) / <alpha-value>)',
          surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
          card: 'rgb(var(--card-rgb) / <alpha-value>)',
          elevated: 'rgb(var(--elevated-rgb) / <alpha-value>)',
          hover: 'rgb(var(--hover-rgb) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'slide-in': 'slideInLeft 0.2s ease-out',
        'pulse-slow': 'pulse 3s infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft: { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        shimmer: { from: { backgroundPosition: '-200% 0' }, to: { backgroundPosition: '200% 0' } },
      },
    },
  },
  plugins: [],
};
