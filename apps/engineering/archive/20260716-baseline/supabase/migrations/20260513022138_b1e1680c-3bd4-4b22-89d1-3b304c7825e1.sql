
ALTER TABLE public.repair_jobs
  ADD COLUMN IF NOT EXISTS work_summary text,
  ADD COLUMN IF NOT EXISTS parts_used jsonb NOT NULL DEFAULT '[]'::jsonb;
