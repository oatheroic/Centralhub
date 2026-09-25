-- Platform-admin guarantee for assets — the companion to
-- apps/engineering/db/migrations/20260924000000_platform_admin.sql; see
-- that file's header for why the guarantee moved out of the gateway's
-- apps.admin_role_code and into an explicit `is_admin` JWT claim.
--
-- NOTE: this file only defines the helper. Unlike engineering, whose
-- policies already keyed off has_role(auth.uid(),'admin'), this app's RLS
-- (20260707000001_rls.sql) checks *only* the four `perm` verbs and has no
-- admin-aware policy to hook into — its admin notion lives entirely in the
-- frontend (role_assignments.is_admin, cached in localStorage). Closing
-- that gap means gating the admin-only tables (role_assignments,
-- department_passwords, person receive passwords) on centralhub_is_admin()
-- instead of on 'edit'/'delete', and dropping the client-side role picker;
-- that is a deliberate follow-up, not this migration, because it changes
-- behaviour for existing users and needs role overrides in place first.
-- The helper lands now so the app and that follow-up have one definition to
-- share, and so `is_admin` is readable from RLS the moment it is needed.
--
-- Idempotent (CREATE OR REPLACE only), re-applied on every container start.
CREATE OR REPLACE FUNCTION public.centralhub_is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'is_admin')::boolean,
    false
  );
$$;

-- Matches the grant centralhub_perm() gets in 20260707000001_rls.sql —
-- without it a policy calling this function fails with "permission denied
-- for function" rather than an RLS denial.
GRANT EXECUTE ON FUNCTION public.centralhub_is_admin() TO assets_authenticated;
