// Framework-agnostic on purpose — no React import — so apps/assets (React
// 19, can't safely import this package's React components, see its
// AssetsNav.tsx) can still share the exact same theme logic as every React
// 18 app here, via the "@centralhub/ui/theme" subpath export.

const STORAGE_KEY = "chub_theme";

export type Theme = "dark" | "light";

// Dark is the default across every app: a browser with no stored
// preference yet always starts dark, regardless of the OS/browser's own
// prefers-color-scheme. tokens.css's `.dark` class forces the dark
// variable set unconditionally, which is exactly what applyTheme uses.
export function getStoredTheme(): Theme {
  return window.localStorage.getItem(STORAGE_KEY) === "light" ? "light" : "dark";
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
}

// One shared localStorage key under the single CentralHub origin — the
// gateway serves every app from the same host, so switching the theme in
// any one app carries over to every other app the next time it loads.
export function setStoredTheme(theme: Theme): void {
  window.localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}
