/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--chub-bg) / <alpha-value>)",
        surface: "rgb(var(--chub-surface) / <alpha-value>)",
        border: "rgb(var(--chub-border) / <alpha-value>)",
        text: "rgb(var(--chub-text) / <alpha-value>)",
        "text-muted": "rgb(var(--chub-text-muted) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--chub-accent) / <alpha-value>)",
          fg: "rgb(var(--chub-accent-fg) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--chub-success) / <alpha-value>)",
          bg: "rgb(var(--chub-success-bg) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--chub-danger) / <alpha-value>)",
          bg: "rgb(var(--chub-danger-bg) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};
