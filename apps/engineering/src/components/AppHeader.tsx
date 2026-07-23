import { ArrowLeft, Wrench } from "lucide-react";
import { ThemeToggle } from "@centralhub/ui";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "@/lib/auth-utils";
import "@centralhub/ui/tokens.css";

// Not an import of packages/ui's compiled AppShell — this app's Tailwind
// v4/shadcn stack stays as-is (see README's third-party app ingestion
// section), so the header layout below is still hand-authored. The theme
// toggle itself is the real shared `packages/ui` component (widened peer
// range now supports React 19), not a re-implementation. No logout button
// here — logout is CentralHub's job (§6/§7), not something this app
// duplicates.
//
// Layout matches every other app's chrome (packages/ui's AppShell,
// AssetsNav): "← Central Hub" leftmost, paired with the app title; only
// the theme toggle sits on the right. An earlier pass put the back link on
// the right instead — inconsistent with the rest of the repo, fixed here.
export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { profile, role } = useAuth();

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
        <ThemeToggle />
      </div>
    </header>
  );
}
