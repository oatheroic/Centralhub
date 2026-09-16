import { supabase } from "@/integrations/supabase/client";

export type RejectionEntry = {
  id: string;
  actor_id: string | null;
  note: string | null;
  created_at: string;
};

// Append-only rejection log on job_history (kind = 'reject'), written by
// both reject paths — the reporter's review and the leader's reject-while-
// awaiting-review — alongside the repair_jobs.reject_reason update. That
// column only ever holds the latest reason; this keeps every one (see
// db/migrations/20260915000003_job_history_kind.sql). Best-effort: a
// failure here is logged, never surfaced, so the status change itself
// (which already succeeded) isn't reported as failed to the user.
export async function recordRejection(jobId: string, actorId: string, reason: string) {
  const { error } = await supabase.from("job_history").insert({
    job_id: jobId, actor_id: actorId, status: "in_progress", note: reason, kind: "reject",
  } as never);
  if (error) console.error("job_history reject entry failed", error);
}

export async function loadRejections(jobId: string): Promise<RejectionEntry[]> {
  const { data } = await supabase
    .from("job_history")
    .select("id, actor_id, note, created_at")
    .eq("job_id", jobId)
    .eq("kind" as never, "reject")
    .order("created_at", { ascending: false });
  return (data ?? []) as RejectionEntry[];
}
