-- Durable audit log for this app's own destructive/reassigning actions
-- (job delete, assign/reassign/revert-to-pending today; more action types
-- can be added later without a schema change, since `detail` is JSONB).
-- Deliberately NOT job_history: job_history.job_id is ON DELETE CASCADE,
-- so it can never outlive the job it's about, and nothing in this app's
-- frontend has ever actually written to it (found live, a dead table left
-- over from the original export). This table has no FK to repair_jobs at
-- all — job_id/job_code are plain denormalized columns, exactly so a
-- job's own deletion can never take its audit trail down with it. Mirrors
-- auth-gateway's own audit_log design (append-only, actor + before/after
-- JSON, denormalized target) rather than inventing a different shape.
CREATE TABLE IF NOT EXISTS public.audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID,
  actor_name TEXT,
  action TEXT NOT NULL,
  job_id UUID,
  job_code TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_job_id ON public.audit_log(job_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Any authenticated engineering user can write their own audit rows (a
-- leader assigning a job, an admin deleting one) -- actor_id is pinned to
-- the caller, same narrowing job_history's own insert policy already uses,
-- so nobody can forge another user as the actor of an action they didn't
-- take.
DROP POLICY IF EXISTS "insert audit_log" ON public.audit_log;
CREATE POLICY "insert audit_log" ON public.audit_log
  FOR INSERT WITH CHECK (actor_id = auth.uid());

-- Read is admin-only -- an audit trail is an oversight tool, not something
-- every user browses (same posture as CentralHub's own admin-only audit
-- log, apps/admin's "Audit" tab).
DROP POLICY IF EXISTS "admin read audit_log" ON public.audit_log;
CREATE POLICY "admin read audit_log" ON public.audit_log
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT ON public.audit_log TO engineering_authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.audit_log_id_seq TO engineering_authenticated;
