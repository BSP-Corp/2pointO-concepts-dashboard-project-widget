/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0f2a4d', 800: '#143a66', 700: '#1b4a80' },
        brand: { 50: '#eff6ff', 100: '#dbeafe', 500: '#2b7de9', 600: '#1f6fd6', 700: '#1a5fb8' },
        panel: {
          overview: '#eaf2fd',
          cost: '#efeafb',
          room: '#e6f6f8',
          boq: '#eaf6ec',
          asset: '#fdf5e1',
          tasks: '#fdecef',
        },
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Segoe UI', 'system-ui', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(15,42,77,.06), 0 1px 3px rgba(15,42,77,.08)' },
    },
  },
  plugins: [],
}
