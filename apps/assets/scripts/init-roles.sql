-- Runs once, at assets-db's own first boot (docker-entrypoint-initdb.d),
-- before storage-assets (supabase/storage-api) ever connects. storage-api's
-- own bundled migrations hardcode these three role names (the standard
-- Supabase-provisioned roles) and fail immediately if they don't exist —
-- a vanilla postgres:16-alpine image has no idea about them. Unrelated to
-- assets_anon/assets_authenticated (PostgREST's roles, created later by
-- 20260707000000_centralhub_rls.sql) — these three are storage-api's own.
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

GRANT anon, authenticated, service_role TO assets;

-- The exported migrations install pgcrypto into an `extensions` schema —
-- standard on Supabase's managed Postgres image, absent from vanilla
-- postgres:16-alpine.
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- storage-api's own SQL (knex) queries `storage.*` tables unqualified (e.g.
-- `from "buckets"`) — its knex config already sets search_path to include
-- `storage` on every connection, so this ALTER just matches that as a
-- session-level default too (harmless no-op here at initdb time, since
-- ALTER ROLE ... SET doesn't validate the schema exists yet). The other
-- half of this fix — GRANT USAGE ON SCHEMA storage, needed because
-- storage-api's per-request `SET ROLE service_role|anon|...` switch doesn't
-- inherit schema visibility on its own — can't happen here: the `storage`
-- schema doesn't exist until storage-assets bootstraps it later. See
-- 20260707000000_centralhub_rls.sql for that half and the full story.
ALTER ROLE assets SET search_path TO storage, public, extensions;
