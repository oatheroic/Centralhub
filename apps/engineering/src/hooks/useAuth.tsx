import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, getResolvedRoleCode, getResolvedDeptName } from "@/integrations/supabase/client";
import type { AppRole } from "@/lib/auth-utils";

// Two different "departments" — see the vocabulary block at the top of
// db/migrations/20260716000000_schema.sql:
//   department      = where the user actually works (CentralHub's own
//                     attribute, JWT dept_name claim) — display only here.
//   department_id / repair_group_name = the engineering repair group
//                     (สังกัดช่าง) responsible for that department's jobs,
//                     resolved by ensure_profile()/current_dept().
export type Profile = {
  id: string;
  code: string;          // CentralHub username (Keycloak preferred_username)
  full_name: string;
  department: string | null;
  department_id: string | null;
  repair_group_name: string | null;
};

type AuthState = {
  loading: boolean;
  userId: string | null;
  profile: Profile | null;
  role: AppRole | null;
  refresh: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

// Identity and login are entirely CentralHub's job (README §6/§7) — this
// app has no login/logout of its own anymore. Role comes from
// GET /auth/data-token's resolved role_code (a per-user override, or an
// attribute rule — see RoleRulesPanel.tsx), not from a Supabase Auth
// session. `profile` is provisioned/refreshed via the ensure_profile()
// Postgres RPC (security definer, keyed to auth.uid() from the minted
// JWT) — it upserts this user's profiles row and resolves their
// department via engineering-db's own department_aliases table (see the
// centralhub_rls migration), never from a per-user field an admin sets.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const roleCode = await getResolvedRoleCode();
      setRole((roleCode as AppRole) ?? null);

      const { data, error } = await supabase.rpc("ensure_profile").single();
      if (error || !data) {
        setUserId(null);
        setProfile(null);
        return;
      }
      const row = data as unknown as {
        id: string; code: string; full_name: string;
        department_id: string | null;
      };
      // ensure_profile() returns a bare profiles row (no join), so the
      // repair group's display name is a second lookup — ReporterPage's
      // read-only "สังกัดช่างที่รับผิดชอบ" field is the main consumer.
      let repairGroupName: string | null = null;
      if (row.department_id) {
        const { data: grp } = await supabase
          .from("departments").select("name").eq("id", row.department_id).maybeSingle();
        repairGroupName = grp?.name ?? null;
      }
      setUserId(row.id);
      setProfile({
        id: row.id,
        code: row.code,
        full_name: row.full_name,
        department: await getResolvedDeptName(),
        department_id: row.department_id,
        repair_group_name: repairGroupName,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Heartbeat: re-provisions (refreshes last_seen_at only, via ensure_profile)
  // every 3 minutes while this tab stays open — without this, last_seen_at
  // only ever reflects the moment of page load, making the admin panel's
  // "online now" view nearly meaningless for anyone who leaves a tab open.
  // Deliberately does NOT re-fetch role/department (no visible UI change,
  // no loading flicker) — just keeps the timestamp fresh in the background.
  useEffect(() => {
    const t = setInterval(() => {
      supabase.rpc("ensure_profile").then(() => {}, () => {});
    }, 3 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <AuthCtx.Provider value={{ loading, userId, profile, role, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
