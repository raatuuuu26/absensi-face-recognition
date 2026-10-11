/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-pink': '#F4A7C5',
        'brand-light-pink': '#FCE7F0',
        'brand-dusty-pink': '#D979A5',
        'brand-dark': '#333333',
      }
    },
  },
  plugins: [],
}
