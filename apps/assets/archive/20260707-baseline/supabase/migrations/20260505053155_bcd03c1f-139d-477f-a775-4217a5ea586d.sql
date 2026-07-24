CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.role_assignments
  ADD COLUMN IF NOT EXISTS password_hash text;

UPDATE public.role_assignments
SET password_hash = extensions.crypt('123456', extensions.gen_salt('bf'))
WHERE password_hash IS NULL;

CREATE OR REPLACE FUNCTION public.verify_role_login(_role_code text, _password text)
RETURNS TABLE(role_code text, display_name text, step_access integer[], is_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT r.role_code, r.display_name, r.step_access, r.is_admin
  FROM public.role_assignments r
  WHERE r.role_code = _role_code
    AND r.password_hash IS NOT NULL
    AND r.password_hash = extensions.crypt(_password, r.password_hash);
$$;