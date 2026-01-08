/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  // Add this section to FORCE the light theme
  daisyui: {
    themes: ["light", "corporate"], 
  },
  plugins: [require("daisyui")],
}