-- Storage bucket + policies for apps/assets, applied after
-- 20260707000000_schema.sql / 20260707000001_rls.sql, and only once
-- storage-assets (supabase/storage-api) has bootstrapped its own `storage`
-- schema on first start — see scripts/migrate.sh for the health-check wait.
-- Split into its own file (rather than filtering storage.* lines out of the
-- schema/RLS files at apply time, the previous approach's fragile
-- grep -viE line filter) per the same convention apps/engineering already
-- uses.
--
-- storage-api does `SELECT set_config('role', 'service_role'|'anon'|...,
-- true)` per request (a mid-transaction role switch, like PostgREST's) —
-- without USAGE on this schema, the switched-to role can't see
-- storage.buckets/storage.objects at all, and Postgres reports the
-- misleading "relation does not exist" (not "permission denied") since the
-- parser can't resolve the name to a visible object at all. Root-caused by
-- watching assets-db's query log (log_statement=all) during a live 500 from
-- GET /bucket/asset-images.
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA storage TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA storage GRANT SELECT ON TABLES TO anon, authenticated;

-- Real end-user requests carry role "assets_authenticated" (from
-- GET /auth/data-token, see services/auth-gateway/src/routes/dataToken.ts),
-- not storage-api's own "anon"/"authenticated"/"service_role" — the grants
-- above only cover storage-api's own bootstrap/admin traffic. Same schema-
-- visibility gap, same fix, different role: found by testing an actual
-- object upload as dev-user and hitting "relation "objects" does not
-- exist" despite RLS being satisfied — the request never got that far.
GRANT USAGE ON SCHEMA storage TO assets_anon, assets_authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage TO assets_authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA storage TO assets_anon;
GRANT ALL ON ALL SEQUENCES IN SCHEMA storage TO assets_authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('asset-images', 'asset-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "public read asset-images" ON storage.objects;
DROP POLICY IF EXISTS "public upload asset-images" ON storage.objects;
DROP POLICY IF EXISTS "public update asset-images" ON storage.objects;
DROP POLICY IF EXISTS "public delete asset-images" ON storage.objects;
DROP POLICY IF EXISTS "centralhub read asset-images" ON storage.objects;
CREATE POLICY "centralhub read asset-images" ON storage.objects FOR SELECT USING (bucket_id = 'asset-images' AND public.centralhub_perm('read'));
DROP POLICY IF EXISTS "centralhub upload asset-images" ON storage.objects;
CREATE POLICY "centralhub upload asset-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'asset-images' AND public.centralhub_perm('write'));
DROP POLICY IF EXISTS "centralhub update asset-images" ON storage.objects;
CREATE POLICY "centralhub update asset-images" ON storage.objects FOR UPDATE USING (bucket_id = 'asset-images' AND public.centralhub_perm('edit'));
DROP POLICY IF EXISTS "centralhub delete asset-images" ON storage.objects;
CREATE POLICY "centralhub delete asset-images" ON storage.objects FOR DELETE USING (bucket_id = 'asset-images' AND public.centralhub_perm('delete'));
