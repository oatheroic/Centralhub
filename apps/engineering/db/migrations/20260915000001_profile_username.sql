-- profiles.code = the CentralHub (Keycloak) username, not a sub fragment.
--
-- Ingestion had nothing human-readable to put in `code` (the original app's
-- employee code came from its own admin-created users, retired in favour of
-- CentralHub login — README §10b), so ensure_profile() fell back to the
-- first 8 hex chars of the Keycloak sub. Live use showed that as a
-- meaningless "รหัสผู้ใช้งาน" on the reporter form. auth-gateway now
-- carries the Keycloak login name as a `username` claim on the minted JWT
-- (dataToken.ts); this redefines ensure_profile() to prefer it, refreshed
-- on every call like full_name/department_id, falling back to the old
-- short code only for a token minted before the claim existed. Identical
-- signature, so 20260716000001_rls.sql's EXECUTE grant carries over.
--
-- Vocabulary, since this function is where the two "department" concepts
-- meet (see the header of 20260716000000_schema.sql):
--   * the caller's *department* = CentralHub's user_attributes.department
--     (where they actually work: Quality Control, Purchasing, …) — carried
--     as the JWT's dept_name claim, never stored here;
--   * public.departments / profiles.department_id = the *repair group*
--     (สังกัดช่าง: ช่างผลิต/ช่างบรรจุ/ช่างทั่วไป) responsible for that
--     department's repair jobs, resolved by current_dept() through
--     department_user_overrides then department_aliases.
CREATE OR REPLACE FUNCTION public.ensure_profile()
RETURNS public.profiles
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  claims json;
  short_code text;
  login_name text;
  display_name text;
  resolved_group uuid;
  result public.profiles;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'no authenticated user';
  END IF;
  claims := NULLIF(current_setting('request.jwt.claims', true), '')::json;
  short_code := substring(uid::text from 1 for 8);
  login_name := COALESCE(NULLIF(claims ->> 'username', ''), short_code);
  display_name := COALESCE(NULLIF(claims ->> 'name', ''), short_code);
  resolved_group := public.current_dept();

  INSERT INTO public.profiles (id, code, full_name, department_id, last_seen_at)
  VALUES (uid, login_name, display_name, resolved_group, now())
  ON CONFLICT (id) DO UPDATE
    SET code = login_name, full_name = display_name,
        department_id = resolved_group, last_seen_at = now()
  RETURNING * INTO result;

  RETURN result;
END;
$$;
