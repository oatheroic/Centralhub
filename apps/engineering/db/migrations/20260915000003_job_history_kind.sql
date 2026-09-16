-- job_history gains a `kind` discriminator, and starts being used.
--
-- The export defined job_history (job_id, actor_id, status, note) but
-- nothing in its UI ever wrote to it. Live testing of the 2026-09-15 update
-- (README §10d first-run notes) found that repair_jobs.reject_reason is a
-- single column, so a second rejection of the same job silently overwrote
-- the first — the repairer lost the earlier reason. Each rejection (by the
-- reporter at review, or by the leader while the job awaits review) now
-- also appends a job_history row: kind = 'reject', note = the reason,
-- actor_id = who rejected, status = the status the job was sent back to.
-- reject_reason itself is kept as "the latest reason" for the list-level
-- red chip (JobStatusChips) and existing readers.
--
-- `kind` is nullable so any future writer (assignment, close-out, …) can
-- add its own value without a migration; existing RLS from
-- 20260716000001_rls.sql already covers it (read follows the job's own
-- visibility, insert requires actor_id = auth.uid()).
ALTER TABLE public.job_history ADD COLUMN IF NOT EXISTS kind TEXT;
CREATE INDEX IF NOT EXISTS idx_job_history_job_id_created ON public.job_history(job_id, created_at);
