import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Leaf, History } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  ADMIN_BOOTSTRAP_CODE,
  codeToEmail,
  codeToPassword,
} from "@/lib/auth-utils";
import { bootstrapAdmin } from "@/lib/admin-users.functions";
import { claimSession } from "@/lib/session.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "เข้าสู่ระบบ — ระบบแจ้งซ่อม Big One Group" }],
  }),
  component: LoginPage,
});

function roleHome(role: string | null): "/admin" | "/leader" | "/repairer" | "/reporter" | "/" {
  if (role === "admin") return "/admin";
  if (role === "leader") return "/leader";
  if (role === "repairer") return "/repairer";
  if (role === "reporter") return "/reporter";
  return "/";
}

const REMEMBER_KEY = "bgone_remember_code";
const SESSION_KEY = "bgone_session_id";
const userSessionKey = (uid: string) => `${SESSION_KEY}:${uid}`;

function LoginPage() {
  const [code, setCode] = useState(() => {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(REMEMBER_KEY) ?? "";
  });
  const [remember, setRemember] = useState(() => {
    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(REMEMBER_KEY) !== null;
  });
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { userId, role, loading, refresh } = useAuth();
  const bootstrap = useServerFn(bootstrapAdmin);

  useEffect(() => {
    if (!loading && userId && role) {
      nav({ to: roleHome(role) });
    }
  }, [loading, userId, role, nav]);

  const doClaim = async (uid: string): Promise<boolean> => {
    const sid = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    try {
      const res = await claimSession({ data: { session_id: sid, force: false } });
      if (!res.ok && res.reason === "in_use") {
        toast.error("รหัสนี้กำลังถูกใช้งานอยู่ในเครื่องอื่น กรุณาติดต่อ admin");
        await supabase.auth.signOut({ scope: "local" });
        return false;
      }
      localStorage.setItem(userSessionKey(uid), sid);
      return true;
    } catch {
      return true; // network blip; continue
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim();
    if (!c) return;
    setBusy(true);
    try {
      const email = codeToEmail(c);
      const password = codeToPassword(c);
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error && c.toLowerCase() === ADMIN_BOOTSTRAP_CODE) {
        await bootstrap();
        ({ error } = await supabase.auth.signInWithPassword({ email, password }));
      }
      if (error) {
        toast.error("รหัสผู้ใช้งานไม่ถูกต้อง");
        return;
      }

      // Remember code preference
      if (remember) localStorage.setItem(REMEMBER_KEY, c);
      else localStorage.removeItem(REMEMBER_KEY);

      const currentUser = (await supabase.auth.getUser()).data.user;
      if (!currentUser) throw new Error("ไม่พบข้อมูลผู้ใช้งาน");

      const ok = await doClaim(currentUser.id);
      if (!ok) {
        toast.error("ยกเลิกการเข้าสู่ระบบ");
        return;
      }
      await refresh();
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", currentUser.id)
        .maybeSingle();
      nav({ to: roleHome((data?.role as string) ?? null) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Decorative arcs */}
      <svg
        className="absolute top-0 right-0 w-[40rem] h-[40rem] opacity-30 pointer-events-none"
        viewBox="0 0 600 600"
      >
        {[...Array(12)].map((_, i) => (
          <circle
            key={i}
            cx="600"
            cy="0"
            r={120 + i * 28}
            fill="none"
            stroke="oklch(0.42 0.12 152)"
            strokeWidth="1"
          />
        ))}
      </svg>

      <div className="relative max-w-xl mx-auto px-6 pt-20 pb-12 text-center">
        <h2 className="font-serif text-2xl text-[oklch(0.5_0.18_25)] font-bold tracking-tight">
          Big One Group
        </h2>
        <div className="my-3 flex items-center justify-center gap-2 text-[oklch(0.5_0.18_25)]/50">
          <span className="h-px w-16 bg-current" />
          <span className="text-xs">◆</span>
          <span className="h-px w-16 bg-current" />
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold text-brand">ระบบแจ้งซ่อม</h1>
        <div className="mt-3 text-brand">·</div>
        <p className="mt-1 text-2xl text-brand/80 italic">Tap. Track. Fix</p>

        <form onSubmit={onSubmit} className="mt-10 space-y-4">
          <div className="card-soft flex items-center gap-3 px-4 py-1 rounded-full shadow-md">
            <Lock className="size-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="รหัสผู้ใช้งาน"
              className="border-0 focus-visible:ring-0 shadow-none bg-transparent text-base h-12"
              disabled={busy}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground select-none cursor-pointer justify-center">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 accent-[oklch(0.42_0.12_152)]"
            />
            จดจำรหัสในเครื่องนี้
          </label>
          <Button
            type="submit"
            disabled={busy}
            className="w-full h-12 rounded-full text-base font-semibold"
          >
            {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
          </Button>
          <Link
            to="/history"
            className="block mt-2 text-center font-semibold text-brand border-2 border-destructive rounded-md py-2 hover:bg-brand-soft transition"
          >
            <History className="size-4 inline mr-1" />
            ประวัติรายการแจ้งซ่อม
          </Link>
        </form>

        <div className="mt-12 flex items-center justify-center gap-2 text-muted-foreground">
          <span className="h-px w-12 bg-border" />
          <span className="text-xs">· · ·</span>
          <span className="h-px w-12 bg-border" />
        </div>
        <div className="mt-3 flex items-center justify-center gap-2 text-brand">
          <Leaf className="size-4" />
        </div>
        <p className="text-sm italic text-muted-foreground mt-1">
          Better spaces begin with better care
        </p>
      </div>
    </main>
  );
}
