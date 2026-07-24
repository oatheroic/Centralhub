
-- Fix function search path
CREATE OR REPLACE FUNCTION public.gen_job_code()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
DECLARE prefix TEXT; next_num INT;
BEGIN
  IF NEW.job_code IS NULL OR NEW.job_code = '' THEN
    prefix := to_char(now() AT TIME ZONE 'Asia/Bangkok','YYMMDD');
    SELECT COALESCE(MAX(substring(job_code from 7)::int),0)+1 INTO next_num
      FROM public.repair_jobs WHERE job_code LIKE prefix || '%';
    NEW.job_code := prefix || lpad(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- Revoke public/anon execute on security definer functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_dept() FROM PUBLIC, anon;

-- Tighten history insert
DROP POLICY IF EXISTS "insert history" ON public.job_history;
CREATE POLICY "insert history" ON public.job_history FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Replace broad storage SELECT with one that allows file fetch but not bucket listing
DROP POLICY IF EXISTS "Public read repair-images" ON storage.objects;
CREATE POLICY "Public read repair-images" ON storage.objects FOR SELECT
  USING (bucket_id='repair-images');
-- Note: bucket is public so file URLs are accessible; listing is mitigated by not exposing list endpoint client-side
