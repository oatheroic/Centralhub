-- Per-user department override — restores the original app's direct
-- admin-assigned profiles.department_id workflow for cases where the
-- generic dept_name -> department_aliases lookup can't resolve (no
-- matching official CentralHub attribute value, unset attribute, or a
-- typo/case mismatch between the two independently-managed tables).
-- Checked BEFORE department_aliases in current_dept() below. Mirrors the
-- already-existing role_code chain exactly (bulk app_role_rules + per-user
-- app_role_overrides in auth-gateway) — this is the department-scoping
-- analog, kept as its own general, role-independent mechanism since
-- profiles.department_id is relied on by every role (reporter's visible
-- machine types/new-job default, repairer's parts-requisition default,
-- leader's job inbox, department_head's parts_requisitions RLS), not just
-- leader. Role assignment itself is untouched — still resolved entirely by
-- auth-gateway's app_role_rules/app_role_overrides.
CREATE TABLE IF NOT EXISTS public.department_user_overrides (
  id SERIAL PRIMARY KEY,
  user_sub UUID NOT NULL UNIQUE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Direct per-user override wins outright; falls back to the existing
-- dept_name -> department_aliases lookup for anyone without one. Signature
-- unchanged (RETURNS uuid, no args), so CREATE OR REPLACE preserves the
-- existing GRANT EXECUTE from 20260716000001_rls.sql.
CREATE OR REPLACE FUNCTION public.current_dept()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT department_id FROM public.department_user_overrides WHERE user_sub = auth.uid()),
    (
      SELECT da.department_id
      FROM public.department_aliases da
      WHERE da.centralhub_department = (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'dept_name')
      LIMIT 1
    )
  );
$$;

ALTER TABLE public.department_user_overrides ENABLE ROW LEVEL SECURITY;

-- Same openness as profiles/department_aliases (any resolved engineering
-- user can already read every profile's department_id) — not a new
-- exposure, only admins write.
DROP POLICY IF EXISTS "read department_user_overrides" ON public.department_user_overrides;
CREATE POLICY "read department_user_overrides" ON public.department_user_overrides
  FOR SELECT USING (public.is_engineering_user());

DROP POLICY IF EXISTS "admin manage department_user_overrides" ON public.department_user_overrides;
CREATE POLICY "admin manage department_user_overrides" ON public.department_user_overrides
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_user_overrides TO engineering_authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.department_user_overrides_id_seq TO engineering_authenticated;
