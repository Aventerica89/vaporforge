/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{astro,html,js,ts}'],
  theme: {
    extend: {
      colors: {
        vapor: {
          bg: '#0f1419',
          accent: '#1dd3e6',
          card: '#1a2029',
          border: '#1e293b',
          muted: '#9ca3af',
          purple: '#E945F5',
          'purple-dark': '#2F4BC0',
          'purple-bg': '#392e4e',
          scan: '#FF9FFC',
        },
      },
      fontFamily: {
        display: ['Orbitron', 'monospace'],
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
      },
      animation: {
        'grid-scan': 'gridScan 4s ease-in-out infinite',
        'float-lines': 'floatLines 8s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'scan-line': 'scanLine 3s linear infinite',
      },
      keyframes: {
        gridScan: {
          '0%, 100%': { transform: 'translateY(-100%)' },
          '50%': { transform: 'translateY(100%)' },
        },
        floatLines: {
          '0%': { transform: 'translateY(0) rotate(0deg)' },
          '33%': { transform: 'translateY(-10px) rotate(0.5deg)' },
          '66%': { transform: 'translateY(5px) rotate(-0.3deg)' },
          '100%': { transform: 'translateY(0) rotate(0deg)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        scanLine: {
          '0%': { top: '-10%' },
          '100%': { top: '110%' },
        },
      },
    },
  },
  plugins: [],
};
