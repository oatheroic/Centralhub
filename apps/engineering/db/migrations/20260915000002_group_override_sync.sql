-- Keep profiles.department_id (the cached repair group) in step with
-- department_user_overrides the moment an admin writes one.
--
-- Found live (README §10d first-run notes): profiles.department_id is
-- refreshed only by ensure_profile(), i.e. only when *that user* next loads
-- a page. But LeaderPage.tsx builds its "assign to repairer" roster from
-- other users' cached department_id — so an admin moving a repairer into a
-- leader's group via "กำหนดสังกัดช่างรายบุคคล" had no visible effect until
-- the repairer happened to log in again, and the leader saw an empty
-- dropdown with nothing wrong in the diagnostics panel (current_dept(),
-- which the diagnostics report, reads the override live and was correct).
-- current_dept()/RLS never read the cache, so authorization was never
-- affected — only the roster and the other display-side readers listed in
-- 20260716000000_schema.sql's profiles comment.
--
-- INSERT/UPDATE: set the cache directly — an override is authoritative
-- (current_dept() checks it first), so the cached value is exactly known.
-- DELETE: not handled here on purpose. Removing an override means the
-- user falls back to the department_aliases path, which needs *their* JWT
-- dept_name claim — unknowable from inside a trigger fired by the admin's
-- request. The cache stays as-is until that user's next ensure_profile();
-- the admin panel's diagnostics section shows the live-resolved value
-- either way. Idempotent (OR REPLACE / DROP TRIGGER IF EXISTS), re-applied
-- on every start like every other file here.
CREATE OR REPLACE FUNCTION public.sync_profile_group_from_override()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET department_id = NEW.department_id
  WHERE id = NEW.user_sub AND department_id IS DISTINCT FROM NEW.department_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_profile_group_from_override ON public.department_user_overrides;
CREATE TRIGGER trg_sync_profile_group_from_override
  AFTER INSERT OR UPDATE OF department_id ON public.department_user_overrides
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_group_from_override();
