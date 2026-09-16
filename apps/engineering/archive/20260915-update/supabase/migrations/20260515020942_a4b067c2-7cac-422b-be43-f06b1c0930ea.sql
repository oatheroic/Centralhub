
-- Single-session login tracking
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS active_session_id text;

-- Google Sheet row tracking + completion timestamp for sheet sync
ALTER TABLE public.repair_jobs ADD COLUMN IF NOT EXISTS sheet_row_index integer;

-- Enable realtime for repair_jobs
ALTER TABLE public.repair_jobs REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'repair_jobs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.repair_jobs';
  END IF;
END$$;
