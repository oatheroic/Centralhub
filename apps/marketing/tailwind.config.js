import chubPreset from "@centralhub/ui/tailwind-preset";

/** @type {import('tailwindcss').Config} */
export default {
  presets: [chubPreset],
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
