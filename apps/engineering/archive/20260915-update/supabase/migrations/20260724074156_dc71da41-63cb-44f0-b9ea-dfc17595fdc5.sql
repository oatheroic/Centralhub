
ALTER TABLE public.repair_jobs
  ADD COLUMN IF NOT EXISTS schedule_mode TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_repair_date DATE,
  ADD COLUMN IF NOT EXISTS schedule_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS parts_ready BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

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

GRANT EXECUTE ON FUNCTION public.expire_pending_schedules() TO authenticated, anon;
