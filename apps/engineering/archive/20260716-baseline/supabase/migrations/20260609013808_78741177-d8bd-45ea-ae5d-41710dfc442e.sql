CREATE OR REPLACE FUNCTION public.gen_job_code()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE prefix TEXT; next_num INT;
BEGIN
  IF NEW.job_code IS NULL OR NEW.job_code = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('repair_jobs_job_code'));
    prefix := to_char(now() AT TIME ZONE 'Asia/Bangkok','YYMMDD');
    SELECT COALESCE(MAX(substring(job_code from 7)::int),0)+1 INTO next_num
      FROM public.repair_jobs WHERE job_code LIKE prefix || '%';
    NEW.job_code := prefix || lpad(next_num::text, 3, '0');
  END IF;
  RETURN NEW;
END $function$;