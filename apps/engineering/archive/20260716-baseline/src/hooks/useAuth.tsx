import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/auth-utils";
import { heartbeatSession, releaseSession } from "@/lib/session.functions";

export type Profile = {
  id: string;
  code: string;
  full_name: string;
  department_id: string | null;
  department_name?: string | null;
  allowed_repair_dept_ids: string[];
};

type AuthState = {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  role: AppRole | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);
const SESSION_KEY = "bgone_session_id";
const userSessionKey = (uid: string) => `${SESSION_KEY}:${uid}`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);

  const loadProfile = async (uid: string) => {
    const [{ data: prof }, { data: roleRow }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, code, full_name, department_id, allowed_repair_dept_ids, departments(name)")
        .eq("id", uid)
        .maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle(),
    ]);
    if (prof) {
      setProfile({
        id: prof.id,
        code: prof.code,
        full_name: prof.full_name,
        department_id: prof.department_id,
        department_name:
          (prof as unknown as { departments?: { name?: string } | null }).departments?.name ?? null,
        allowed_repair_dept_ids:
          ((prof as unknown as { allowed_repair_dept_ids?: string[] | null }).allowed_repair_dept_ids ?? []) as string[],
      });
    } else setProfile(null);
    setRole((roleRow?.role as AppRole) ?? null);
  };

  const refresh = async () => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id ?? null;
    setUserId(uid);
    if (uid) await loadProfile(uid);
    else { setProfile(null); setRole(null); }
  };

  useEffect(() => {
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user?.id ?? null;
      if (!mounted) return;
      setUserId(uid);
      if (uid) {
        setLoading(true);
        setTimeout(() => {
          loadProfile(uid).finally(() => mounted && setLoading(false));
        }, 0);
      } else {
        setProfile(null);
        setRole(null);
        setLoading(false);
      }
    });
    refresh().finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Heartbeat to keep this device's session-slot alive every 30s.
  // If the slot is no longer ours (admin kicked us), sign out immediately.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const beat = async () => {
      const sid = typeof localStorage !== "undefined" ? localStorage.getItem(userSessionKey(userId)) : null;
      if (!sid) return;
      try {
        const res = await heartbeatSession({ data: { session_id: sid } });
        if (cancelled) return;
        if (!res.valid) {
          localStorage.removeItem(userSessionKey(userId));
          await supabase.auth.signOut({ scope: "local" });
          setUserId(null); setProfile(null); setRole(null);
          if (typeof window !== "undefined") {
            const { toast } = await import("sonner");
            toast.error("ถูกออกจากระบบโดย admin หรือมีการเข้าใช้งานในเครื่องอื่น");
          }
        }
      } catch {
        /* ignore network blip */
      }
    };
    beat();
    const t = setInterval(beat, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [userId]);

  const signOut = async () => {
    try { await releaseSession(); } catch { /* ignore */ }
    if (typeof localStorage !== "undefined" && userId) localStorage.removeItem(userSessionKey(userId));
    await supabase.auth.signOut({ scope: "local" });
    setUserId(null); setProfile(null); setRole(null);
  };

  return (
    <AuthCtx.Provider value={{ loading, userId, profile, role, refresh, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
