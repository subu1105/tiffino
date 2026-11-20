/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#eef6f1',
          100: '#d5e8dd',
          200: '#aed2bf',
          300: '#7fb69c',
          400: '#52977a',
          500: '#357c60',
          600: '#27654e',
          700: '#1f5240',
          800: '#1b4332',
          900: '#143627',
          950: '#0b2118',
        },
        flame: {
          50: '#fff4e5',
          100: '#ffe3bf',
          200: '#ffc98c',
          300: '#ffab52',
          400: '#fb8f26',
          500: '#f77f00',
          600: '#d96b00',
          700: '#b35505',
          800: '#8f440b',
          900: '#75390d',
        },
        cream: '#FFF8F0',
        charcoal: '#2B2D2F',
        success: '#2E9E5B',
        warning: '#E8930C',
        danger: '#E05B4C',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Figtree', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '1.25rem',
      },
      boxShadow: {
        card: '0 1px 3px rgba(27, 67, 50, 0.07), 0 6px 20px rgba(27, 67, 50, 0.06)',
        lift: '0 4px 10px rgba(27, 67, 50, 0.10), 0 12px 32px rgba(27, 67, 50, 0.10)',
      },
    },
  },
  plugins: [],
};
