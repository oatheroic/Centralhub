-- Platform-admin guarantee: a CentralHub Keycloak realm admin is an admin
-- inside every third-party app, unconditionally and with no per-app
-- configuration to forget, clear, or get wrong.
--
-- Before this, the guarantee was expressed indirectly through the gateway's
-- apps.admin_role_code: resolveRoleCode() returned that code for a realm
-- admin, so this app saw role_code='admin' and has_role() happened to be
-- true. That worked only for an app whose admin_role_code was set (assets
-- and engineering, via a dev-only bootstrap map), silently did nothing for
-- every other app, and vanished permanently if an admin cleared the field
-- in apps/admin's Apps tab.
--
-- Now auth-gateway mints an explicit `is_admin` claim (routes/dataToken.ts)
-- that is true for a realm admin regardless of this app's configuration, OR
-- for a normal user promoted to this app's own admin role code via a role
-- override/rule. The two are deliberately indistinguishable here: this app
-- has one notion of "admin", and a platform admin always satisfies it.
-- admin_role_code keeps its remaining job — naming which local code means
-- "admin here" — but the platform half no longer depends on it.
--
-- Idempotent (CREATE OR REPLACE only), re-applied on every container start
-- like every other migration in this directory. Ordering matters: this file
-- re-defines two functions first created in 20260716000000_schema.sql, so
-- it must run after it (see scripts/migrate.sh).
CREATE OR REPLACE FUNCTION public.centralhub_is_admin()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'is_admin')::boolean,
    false
  );
$$;

-- Only the 'admin' branch gains the guarantee — a platform admin must not
-- read as 'repairer'/'leader'/'reporter' too, or every role-specific policy
-- (and the UI routing that mirrors it) would treat them as all roles at
-- once. Otherwise unchanged from 20260716000000_schema.sql.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'role_code') = _role::text,
    false
  ) OR (_role = 'admin' AND public.centralhub_is_admin());
$$;

-- "Any user of this app at all", used for reference-data/storage reads. A
-- platform admin for whom no role code resolves (possible once the
-- guarantee no longer routes through admin_role_code) still qualifies.
CREATE OR REPLACE FUNCTION public.is_engineering_user()
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'role_code') IS NOT NULL
      OR public.centralhub_is_admin();
$$;

-- Same reason as the grants in 20260716000001_rls.sql: without this,
-- engineering_authenticated cannot execute the function a policy calls, and
-- the query fails with a bare "permission denied for function" rather than
-- an RLS denial.
GRANT EXECUTE ON FUNCTION public.centralhub_is_admin() TO engineering_authenticated;
