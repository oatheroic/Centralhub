import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Points at this app's own self-hosted PostgREST/storage-api, proxied
// through the gateway at /apps/assets/api/ — not a cloud Supabase project.
// See README's third-party app ingestion section and
// services/auth-gateway/src/routes/dataToken.ts.
const SUPABASE_URL = window.location.origin + "/apps/assets/api";

// Not a real Supabase anon key — auth is via the bearer token fetched below,
// verified by PostgREST/storage-api against PGRST_JWT_SECRET. This string
// only satisfies createClient()'s required parameter; it is never checked.
const SUPABASE_PLACEHOLDER_KEY = "centralhub-self-hosted";

let dataToken: string | null = null;
let resolvedRoleCode: string | null = null;
let dataTokenPromise: Promise<string | null> | null = null;

async function fetchDataToken(): Promise<string | null> {
  const res = await fetch("/auth/data-token?app=assets", { credentials: "same-origin" });
  if (!res.ok) return null;
  const body = (await res.json()) as { token: string; role_code: string | null };
  resolvedRoleCode = body.role_code;
  return body.token;
}

// Fetched once per page load (a 15-minute token comfortably outlives a
// single session of filling out a form) rather than per-request — matches
// how every other app already treats its CentralHub session, and avoids a
// network round-trip before every Supabase call.
async function getDataToken(): Promise<string | null> {
  if (dataToken) return dataToken;
  if (!dataTokenPromise) dataTokenPromise = fetchDataToken();
  dataToken = await dataTokenPromise;
  return dataToken;
}

// The role_code resolved from the caller's CentralHub department/position/
// job level against this app's rules (see RoleRulesPanel.tsx) — null if
// none of the app's rules match, or the user's attributes aren't set yet.
// Shares fetchDataToken's cached promise rather than firing a second
// request, since both come back in the same /auth/data-token response.
export async function getResolvedRoleCode(): Promise<string | null> {
  await getDataToken();
  return resolvedRoleCode;
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
