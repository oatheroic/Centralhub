import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { applyTheme, getStoredTheme, setStoredTheme, type Theme } from "../theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = getStoredTheme();
    // Applied here too (not just in each app's main.tsx bootstrap) so the
    // toggle stays correct even if a consumer forgets the bootstrap call.
    applyTheme(initial);
    return initial;
  });

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setStoredTheme(next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-muted transition hover:bg-border hover:text-text"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
