import { LogOut, Wrench } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABEL } from "@/lib/auth-utils";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  const { profile, role, signOut } = useAuth();
  const nav = useNavigate();

  return (
    <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-brand-soft text-brand grid place-items-center">
            <Wrench className="size-5" />
          </div>
          <div>
            <div className="font-bold text-base leading-tight">ระบบแจ้งซ่อม</div>
            <div className="text-xs text-muted-foreground">
              {subtitle ?? (role ? ROLE_LABEL[role] : "")}
              {profile ? ` · ${profile.full_name}${profile.code ? ` (${profile.code})` : ""}` : ""}
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => { await signOut(); nav({ to: "/" }); }}
        >
          <LogOut className="size-4 mr-1" /> ออกจากระบบ
        </Button>
      </div>
    </header>
  );
}
