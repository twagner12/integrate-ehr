/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Integrate brand teal (from logo)
        brand: {
          50:  '#f0fafb',
          100: '#d9f2f5',
          200: '#b3e5eb',
          300: '#7dd0da',
          400: '#3fb5c4',
          500: '#2499a8',  // primary
          600: '#1e7d8c',
          700: '#1c6573',
          800: '#1c515e',
          900: '#1a4450',
        },
      },
    },
  },
  plugins: [],
};
