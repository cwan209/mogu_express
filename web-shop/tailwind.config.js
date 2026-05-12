/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#E34D59',
          50:  '#FCE9EB',
          100: '#F8C8CD',
          200: '#F19BA3',
          300: '#EA6E78',
          400: '#E34D59',
          500: '#D03843',
          600: '#A82B35',
          700: '#7F1F27',
          800: '#56131A',
          900: '#2D080C',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Helvetica Neue"', '"PingFang SC"', '"Microsoft YaHei"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
