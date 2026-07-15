-- Runs once, at engineering-db's own first boot (docker-entrypoint-initdb.d),
-- before storage-engineering (supabase/storage-api) ever connects.
-- storage-api's own bundled migrations hardcode these three role names (the
-- standard Supabase-provisioned roles) and fail immediately if they don't
-- exist — a vanilla postgres:16-alpine image has no idea about them.
-- Unrelated to engineering_anon/engineering_authenticated (PostgREST's
-- roles, created later by 20260716000001_rls.sql) — these three are
-- storage-api's own. Mirrors apps/assets/scripts/init-roles.sql exactly.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END
$$;

GRANT anon, authenticated, service_role TO engineering;

-- storage-api's own SQL (knex) queries `storage.*` tables unqualified — its
-- knex config already sets search_path to include `storage` on every
-- connection; this ALTER just matches that as a session-level default too
-- (harmless no-op here at initdb time, since ALTER ROLE ... SET doesn't
-- validate the schema exists yet). The GRANT USAGE ON SCHEMA storage half
-- of this fix can't happen here — the `storage` schema doesn't exist until
-- storage-engineering bootstraps it later. See
-- 20260716000002_storage.sql for that half.
ALTER ROLE engineering SET search_path TO storage, public;
