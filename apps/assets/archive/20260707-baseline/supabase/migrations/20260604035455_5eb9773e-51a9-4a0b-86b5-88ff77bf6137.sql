
-- 1) Fix search_path on set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- 2) Add has_password generated columns
ALTER TABLE public.department_passwords
  ADD COLUMN IF NOT EXISTS has_password boolean
  GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED;

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS has_password boolean
  GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED;

ALTER TABLE public.person_receive_passwords
  ADD COLUMN IF NOT EXISTS has_password boolean
  GENERATED ALWAYS AS (password_hash IS NOT NULL) STORED;

-- 3) Revoke direct SELECT on password_hash columns (anon/authenticated/public)
REVOKE SELECT (password_hash) ON public.department_passwords FROM anon, authenticated, PUBLIC;
REVOKE SELECT (password_hash) ON public.role_assignments FROM anon, authenticated, PUBLIC;
REVOKE SELECT (password_hash) ON public.person_receive_passwords FROM anon, authenticated, PUBLIC;

-- 4) Lock doc_number_sequences — only accessible via SECURITY DEFINER functions
CREATE OR REPLACE FUNCTION public.peek_next_doc_number()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  cur_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  cur_month int := EXTRACT(MONTH FROM CURRENT_DATE)::int;
  last_num int;
BEGIN
  SELECT last_number INTO last_num FROM public.doc_number_sequences WHERE year = cur_year;
  last_num := COALESCE(last_num, 0) + 1;
  RETURN cur_year::text || '-' || LPAD(cur_month::text, 2, '0') || '-' || LPAD(last_num::text, 3, '0');
END;
$$;

REVOKE ALL ON public.doc_number_sequences FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.doc_number_sequences TO service_role;

GRANT EXECUTE ON FUNCTION public.peek_next_doc_number() TO anon, authenticated;
