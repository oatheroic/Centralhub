import { ThemeToggle } from "@centralhub/ui";
import "@centralhub/ui/tokens.css";

// Not an import of packages/ui's compiled AppShell — this app's own
// Tailwind v4/shadcn design system stays as-is (see README's third-party
// app ingestion section), so the header layout below is still hand-authored
// via Tailwind v4 arbitrary-value utilities against the shared CSS custom
// properties (tokens.css). The theme toggle itself, though, is the real
// shared `packages/ui` component (widened peer range now supports React
// 19) rather than a re-implementation, so the exact dark/light logic — and
// its one shared localStorage key — comes from one place, not a copy.
export function AssetsNav() {
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
        <ThemeToggle />
      </div>
    </header>
  );
}
