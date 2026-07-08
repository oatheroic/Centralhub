import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getStoredTheme, setStoredTheme, type Theme } from "@centralhub/ui/theme";
import "@centralhub/ui/tokens.css";

// Deliberately hand-authored, not an import of packages/ui's compiled
// AppShell — that package's React peer dep is ^18.3.1, this app runs
// React 19, and its own Tailwind v4/shadcn design system stays as-is
// (see README's third-party app ingestion section). Only tokens.css (plain
// CSS custom properties, framework-agnostic) is shared, via Tailwind v4
// arbitrary-value utilities, so the one shared "chrome" element — the top
// bar — reads as CentralHub, not a visually disconnected island.
//
// The theme toggle below is the same story: "@centralhub/ui/theme" is a
// separate, React-free subpath export (see packages/ui/src/theme.ts) so
// this app can share the exact dark/light logic — and its one shared
// localStorage key — with every other app despite the React version
// mismatch. This app's own styles.css already ships a full shadcn `.dark`
// palette (unused until now); toggling the `dark` class on <html> is all
// that's needed to activate it.
export function AssetsNav() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setStoredTheme(next);
    setTheme(next);
  }

  return (
    <header className="flex items-center justify-between border-b border-[rgb(var(--chub-border))] bg-[rgb(var(--chub-surface))] px-6 py-3">
      <a
        href="/"
        className="text-sm font-medium text-[rgb(var(--chub-text-muted))] transition hover:text-[rgb(var(--chub-accent))]"
      >
        ← Central Hub
      </a>
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-[rgb(var(--chub-text))]">Assets</span>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[rgb(var(--chub-text-muted))] transition hover:bg-[rgb(var(--chub-border))] hover:text-[rgb(var(--chub-text))]"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
