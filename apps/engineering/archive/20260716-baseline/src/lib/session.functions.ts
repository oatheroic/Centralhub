import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const sidSchema = z.object({ session_id: z.string().min(8).max(128) });

// A session is considered "alive" if its heartbeat is within this many seconds.
const ALIVE_WINDOW_SEC = 90;

/**
 * Claim the session for the current device.
 * If another session is still alive (heartbeat within window), refuse unless force=true.
 */
export const claimSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ session_id: z.string().min(8).max(128), force: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("active_session_id, active_session_seen_at")
      .eq("id", context.userId)
      .maybeSingle();

    const now = Date.now();
    const seen = row?.active_session_seen_at ? new Date(row.active_session_seen_at).getTime() : 0;
    const alive = !!row?.active_session_id
      && row.active_session_id !== data.session_id
      && now - seen < ALIVE_WINDOW_SEC * 1000;

    if (alive && !data.force) {
      return { ok: false, reason: "in_use" as const };
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        active_session_id: data.session_id,
        active_session_seen_at: new Date().toISOString(),
      })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Heartbeat: keeps current session alive AND tells caller whether it still owns the slot.
 * Returns valid=true if this session_id is the current owner.
 * Does NOT auto-kick — caller decides what to do with the result.
 */
export const heartbeatSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sidSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("active_session_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (row?.active_session_id === data.session_id) {
      // Refresh heartbeat
      await supabaseAdmin
        .from("profiles")
        .update({ active_session_seen_at: new Date().toISOString() })
        .eq("id", context.userId);
      return { valid: true };
    }
    return { valid: false };
  });

// Backward-compatible alias used elsewhere in the codebase.
export const verifySession = heartbeatSession;

export const releaseSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await supabaseAdmin
      .from("profiles")
      .update({ active_session_id: null, active_session_seen_at: null })
      .eq("id", context.userId);
    return { ok: true };
  });

// Admin-only: forcibly clear another user's active session so they can re-login.
export const adminReleaseUserSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) throw new Error("ต้องเป็น admin");
    await supabaseAdmin
      .from("profiles")
      .update({ active_session_id: null, active_session_seen_at: null })
      .eq("id", data.user_id);
    return { ok: true };
  });
