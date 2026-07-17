import { supabase } from "@/integrations/supabase/client";

// Shared write path for this app's own audit_log (see
// db/migrations/20260717000001_audit_log.sql) -- every caller passes the
// current user's own profile so actor_id/actor_name are always the real
// caller, matching the RLS insert policy's actor_id = auth.uid() check.
// Fire-and-forget by design: a failed audit write must never block the
// real action it's describing (same fail-soft posture auth-gateway's own
// audit.ts uses) -- logged to the console instead so a broken write isn't
// silently invisible either.
export async function logAudit(
  actor: { id: string; full_name: string } | null,
  action: string,
  job: { id: string; job_code: string } | null,
  detail?: Record<string, unknown>,
): Promise<void> {
  try {
    const { error } = await supabase.from("audit_log").insert({
      actor_id: actor?.id ?? null,
      actor_name: actor?.full_name ?? null,
      action,
      job_id: job?.id ?? null,
      job_code: job?.job_code ?? null,
      detail: detail ?? null,
    });
    if (error) console.error("audit_log insert failed", action, error);
  } catch (err) {
    console.error("audit_log insert threw", action, err);
  }
}
