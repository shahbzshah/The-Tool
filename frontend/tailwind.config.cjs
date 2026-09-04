/** @type {import('tailwindcss').Config} */
// Design tokens from docs/DESIGN_SYSTEM.md (Zenith IDE token set)
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0b1326',
          dim: '#0b1326',
          bright: '#31394d',
          'lowest': '#060e20',
          'low': '#131b2e',
          container: '#171f33',
          high: '#222a3d',
          highest: '#2d3449'
        },
        'on-surface': '#dae2fd',
        'on-surface-variant': '#bbcabf',
        outline: '#86948a',
        'outline-variant': '#3c4a42',
        primary: {
          DEFAULT: '#4edea3',
          container: '#10b981',
          'on-container': '#00422b'
        },
        'on-primary': '#003824',
        secondary: {
          DEFAULT: '#d0bcff',
          container: '#571bc1',
          'on-container': '#c4abff'
        },
        'on-secondary': '#3c0091',
        tertiary: {
          DEFAULT: '#ffb95f',
          container: '#e29100'
        },
        'on-tertiary': '#472a00',
        error: {
          DEFAULT: '#ffb4ab',
          container: '#93000a',
          'on-container': '#ffdad6'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      }
    }
  },
  plugins: []
};
