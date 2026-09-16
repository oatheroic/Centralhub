-- Repair scheduling — the first post-ingestion update pulled from Lovable
-- (README §10d; the export it came from is archived as
-- apps/engineering/archive/20260915-update/, whose
-- supabase/migrations/20260724074156_*.sql is the upstream original of
-- this file). A reporter now picks, when filing a job, either a fixed
-- repair date or "within 10 days"; in the latter case the leader can't
-- assign until the reporter comes back and sets a date, and a job still
-- undated past its 10-day deadline is auto-cancelled (cancelled_at set —
-- there is deliberately no new job_status enum value; "cancelled" is
-- derived from cancelled_at in the UI so no existing status-keyed policy
-- or filter changes meaning). parts_ready is the repairer's "parts have
-- arrived" flag on a waiting_parts job, which re-opens the reporter's
-- date picker.
--
-- Purely additive: every column is nullable or defaulted, so the live
-- repair_jobs rows that predate this update need no backfill, and the
-- existing "update jobs by role" policy already covers a reporter editing
-- their own job's scheduled_repair_date — no new RLS. Idempotent like
-- every other file here; migrate.sh re-applies it on every start.

ALTER TABLE public.repair_jobs
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_repair_date DATE,
  ADD COLUMN IF NOT EXISTS schedule_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parts_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Called by the reporter/leader pages on load (supabase.rpc) rather than a
-- scheduler — same as upstream, which had no cron either. SECURITY DEFINER
-- so it can expire any department's overdue jobs regardless of who
-- triggered the page load; the WHERE is narrow enough (only never-dated,
-- never-assigned, past-deadline within_10_days jobs) that the caller's
-- own RLS scope doesn't matter. Granted to engineering_authenticated only
-- — upstream also granted anon, but nothing here ever runs unauthenticated
-- (README §6).
CREATE OR REPLACE FUNCTION public.expire_pending_schedules()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.repair_jobs
  SET cancelled_at = now(), updated_at = now()
  WHERE status = 'pending_assign'
    AND schedule_mode = 'within_10_days'
    AND scheduled_repair_date IS NULL
    AND schedule_deadline IS NOT NULL
    AND schedule_deadline < now()
    AND cancelled_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.expire_pending_schedules() TO engineering_authenticated;
