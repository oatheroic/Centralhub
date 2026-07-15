import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Points at this app's own self-hosted PostgREST/storage-api, proxied
// through the gateway at /apps/engineering/api/ — not a hosted Supabase
// project, and no more of this app's own Supabase Auth. See README's
// engineering ingestion section and
// services/auth-gateway/src/routes/dataToken.ts.
const SUPABASE_URL = window.location.origin + "/apps/engineering/api";

// Not a real Supabase anon key — auth is via the bearer token fetched
// below, verified by PostgREST/storage-api against PGRST_JWT_SECRET. This
// string only satisfies createClient()'s required parameter; it is never
// checked.
const SUPABASE_PLACEHOLDER_KEY = "centralhub-self-hosted";

let dataToken: string | null = null;
let resolvedRoleCode: string | null = null;
let resolvedDeptName: string | null = null;
let dataTokenPromise: Promise<string | null> | null = null;

async function fetchDataToken(): Promise<string | null> {
  const res = await fetch("/auth/data-token?app=engineering", { credentials: "same-origin" });
  if (!res.ok) return null;
  const body = (await res.json()) as { token: string; role_code: string | null; dept_name?: string | null };
  resolvedRoleCode = body.role_code;
  resolvedDeptName = body.dept_name ?? null;
  return body.token;
}

// Fetched once per page load (a 15-minute token comfortably outlives a
// single session) rather than per-request — matches how every other app
// already treats its CentralHub session.
async function getDataToken(): Promise<string | null> {
  if (dataToken) return dataToken;
  if (!dataTokenPromise) dataTokenPromise = fetchDataToken();
  dataToken = await dataTokenPromise;
  return dataToken;
}

// The role_code resolved from the caller's CentralHub department/position/
// job level against this app's rules — either a per-user override or an
// attribute rule (see RoleRulesPanel.tsx). Null if nothing resolves, in
// which case this app has no page to show the user.
export async function getResolvedRoleCode(): Promise<string | null> {
  await getDataToken();
  return resolvedRoleCode;
}

// The caller's raw CentralHub `department` attribute value (e.g.
// "Purchasing") — resolved to this app's own departments.id entirely
// inside engineering-db (department_aliases table + current_dept()), never
// in auth-gateway. Used client-side only to look up that same alias table
// for display/filtering (see useAuth.tsx); RLS resolves it independently,
// server-side, from the JWT's dept_name claim.
export async function getResolvedDeptName(): Promise<string | null> {
  await getDataToken();
  return resolvedDeptName;
}

function createSupabaseClient() {
  return createClient<Database>(SUPABASE_URL, SUPABASE_PLACEHOLDER_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: async (input, init) => {
        const token = await getDataToken();
        const headers = new Headers(init?.headers);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

let _supabase: ReturnType<typeof createSupabaseClient> | undefined;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient>, {
  get(_, prop, receiver) {
    if (!_supabase) _supabase = createSupabaseClient();
    return Reflect.get(_supabase, prop, receiver);
  },
});
