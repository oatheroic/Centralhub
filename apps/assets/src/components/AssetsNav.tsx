import "@centralhub/ui/tokens.css";

// Deliberately hand-authored, not an import of packages/ui's compiled
// AppShell — that package's React peer dep is ^18.3.1, this app runs
// React 19, and its own Tailwind v4/shadcn design system stays as-is
// (see README's third-party app ingestion section). Only tokens.css (plain
// CSS custom properties, framework-agnostic) is shared, via Tailwind v4
// arbitrary-value utilities, so the one shared "chrome" element — the top
// bar — reads as CentralHub, not a visually disconnected island.
export function AssetsNav() {
  return (
    <header className="flex items-center justify-between border-b border-[rgb(var(--chub-border))] bg-[rgb(var(--chub-surface))] px-6 py-3">
      <a
        href="/"
        className="text-sm font-medium text-[rgb(var(--chub-text-muted))] transition hover:text-[rgb(var(--chub-accent))]"
      >
        ← Central Hub
      </a>
      <span className="text-sm font-semibold text-[rgb(var(--chub-text))]">Assets</span>
    </header>
  );
}
