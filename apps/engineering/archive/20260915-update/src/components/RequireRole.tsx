import { type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { AppRole } from "@/lib/auth-utils";
import { AppHeader } from "./AppHeader";

export function RequireRole({ role, children }: { role: AppRole; children: ReactNode }) {
  const { loading, userId, role: userRole } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!userId) nav({ to: "/" });
    else if (userRole !== role) nav({ to: "/" });
  }, [loading, userId, userRole, role, nav]);

  if (loading || !userId || userRole !== role) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground">
        กำลังโหลด…
      </div>
    );
  }
  return (
    <>
      <AppHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">{children}</div>
    </>
  );
}
