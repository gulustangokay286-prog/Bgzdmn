
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: '#1e293b',
      }
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  }
}
