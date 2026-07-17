import { useState } from "react";
import { ArrowLeft, Wrench, Moon, Sun } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "@/lib/auth-utils";
import { getStoredTheme, setStoredTheme, type Theme } from "@centralhub/ui/theme";
import "@centralhub/ui/tokens.css";

// Deliberately hand-authored, not an import of packages/ui's compiled
// AppShell — this app's React 19 / Tailwind v4 stack stays as-is (peer dep
// conflict with packages/ui's React ^18.3.1, same as apps/assets). Only
// tokens.css and the React-free @centralhub/ui/theme subpath are shared,
// so this one chrome element reads as CentralHub. No logout button here —
// logout is CentralHub's job (§6/§7), not something this app duplicates.
//
// Layout matches every other app's chrome (packages/ui's AppShell,
// AssetsNav): "← Central Hub" leftmost, paired with the app title; only
// the theme toggle sits on the right. An earlier pass put the back link on
// the right instead — inconsistent with the rest of the repo, fixed here.
export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { profile, role } = useAuth();
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setStoredTheme(next);
    setTheme(next);
  }

  return (
    <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <a
            href="/"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-brand shrink-0"
          >
            <ArrowLeft size={16} />
            Central Hub
          </a>
          <span className="text-border">/</span>
          <div className="size-10 rounded-xl bg-brand-soft text-brand grid place-items-center">
            <Wrench className="size-5" />
          </div>
          <div>
            <div className="font-bold text-base leading-tight">ระบบแจ้งซ่อม</div>
            <div className="text-xs text-muted-foreground">
              {subtitle ?? (role ? ROLE_LABEL[role] : "")}
              {profile ? ` · ${profile.full_name}` : ""}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </div>
    </header>
  );
}
