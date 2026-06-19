/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#05070a",
        surface: "#0f1218",
        primary: "#00f2ff", // Neon Cyan
        secondary: "#7000ff", // Electric Purple
        accent: "#00ff95", // Cyber Green
        slate: {
          900: "#0a0c10",
          800: "#14181f",
        }
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0) 100%)',
        'cyber-gradient': 'linear-gradient(90deg, #00f2ff 0%, #7000ff 100%)',
      }
    },
  },
  plugins: [],
}
