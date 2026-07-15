-- Storage bucket + policies for repair-job photos. Kept in its own file,
-- applied only after storage-engineering (supabase/storage-api) has
-- bootstrapped its own `storage` schema on first start (see
-- scripts/migrate.sh) — the `storage` schema doesn't exist before that, so
-- this can't run alongside 20260716000000/1.
--
-- storage-api does a per-request Postgres role switch (SELECT
-- set_config('role', '<role>', true)) to enforce its own checks — a role
-- switch does not carry schema visibility with it. Without USAGE on this
-- schema, every storage.* query fails with a misleading "relation does not
-- exist" (not "permission denied"), since the parser can't resolve the
-- name to a visible object at all. Two separate role sets need the grant:
-- storage-api's own bootstrap roles, and the role real end-user requests
-- actually carry (engineering_authenticated) — root-caused the same way
-- apps/assets's own storage migration was, by watching a live 500 against
-- assets-db's query log.
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA storage TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT SELECT ON TABLES TO anon, authenticated;

GRANT USAGE ON SCHEMA storage TO engineering_anon, engineering_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO engineering_authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO engineering_authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('repair-images', 'repair-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "centralhub read repair-images" ON storage.objects;
CREATE POLICY "centralhub read repair-images" ON storage.objects FOR SELECT
  USING (bucket_id = 'repair-images' AND public.is_engineering_user());
DROP POLICY IF EXISTS "centralhub upload repair-images" ON storage.objects;
CREATE POLICY "centralhub upload repair-images" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'repair-images' AND public.is_engineering_user());
DROP POLICY IF EXISTS "centralhub update own repair-images" ON storage.objects;
CREATE POLICY "centralhub update own repair-images" ON storage.objects FOR UPDATE
  USING (bucket_id = 'repair-images' AND owner = auth.uid());
