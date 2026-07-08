-- CentralHub ingestion rewrite: every policy in the exported migrations
-- above is USING (true)/WITH CHECK (true) — RLS is enabled but enforces
-- nothing; the anon key alone is enough to read/write/delete any row. This
-- migration replaces that with real checks against the JWT that
-- auth-gateway's GET /auth/data-token mints (see services/auth-gateway),
-- signed with the same PGRST_JWT_SECRET postgrest-assets verifies.
--
-- The minted JWT's shape is: { "role": "assets_authenticated", "sub": "<centralhub user id>",
-- "perm": { "read": bool, "write": bool, "edit": bool, "delete": bool } }
-- — the same four-verb model every other app's app_permissions row already
-- uses (see services/auth-gateway/src/permissions.ts).
--
-- Applied AFTER storage-assets has bootstrapped its own `storage` schema
-- (see apps/assets/scripts/migrate.sh) — the exported migrations' storage.*
-- statements were stripped before those ran for exactly that reason; this
-- file is where the bucket and its policies actually get created.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'assets_anon') THEN
    CREATE ROLE assets_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'assets_authenticated') THEN
    CREATE ROLE assets_authenticated NOLOGIN;
  END IF;
END
$$;
GRANT assets_anon TO assets;
GRANT assets_authenticated TO assets;
GRANT USAGE ON SCHEMA public TO assets_anon, assets_authenticated;

CREATE OR REPLACE FUNCTION public.centralhub_perm(_verb text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json -> 'perm' ->> _verb)::boolean,
    false
  );
$$;

-- Uniform verb-checked policy set, applied per table below: SELECT->read,
-- INSERT->write, UPDATE->edit, DELETE->delete. Grants are base-level
-- (required for PostgREST to attempt the operation at all); RLS narrows to
-- the caller's actual permission row on top of that.

-- asset_purchase_requests
DROP POLICY IF EXISTS "public read requests" ON public.asset_purchase_requests;
DROP POLICY IF EXISTS "public insert requests" ON public.asset_purchase_requests;
DROP POLICY IF EXISTS "public update requests" ON public.asset_purchase_requests;
DROP POLICY IF EXISTS "public delete requests" ON public.asset_purchase_requests;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_purchase_requests TO assets_authenticated;
DROP POLICY IF EXISTS "centralhub read requests" ON public.asset_purchase_requests;
CREATE POLICY "centralhub read requests" ON public.asset_purchase_requests FOR SELECT USING (public.centralhub_perm('read'));
DROP POLICY IF EXISTS "centralhub insert requests" ON public.asset_purchase_requests;
CREATE POLICY "centralhub insert requests" ON public.asset_purchase_requests FOR INSERT WITH CHECK (public.centralhub_perm('write'));
DROP POLICY IF EXISTS "centralhub update requests" ON public.asset_purchase_requests;
CREATE POLICY "centralhub update requests" ON public.asset_purchase_requests FOR UPDATE USING (public.centralhub_perm('edit')) WITH CHECK (public.centralhub_perm('edit'));
DROP POLICY IF EXISTS "centralhub delete requests" ON public.asset_purchase_requests;
CREATE POLICY "centralhub delete requests" ON public.asset_purchase_requests FOR DELETE USING (public.centralhub_perm('delete'));

-- dropdown_options
DROP POLICY IF EXISTS "public read options" ON public.dropdown_options;
DROP POLICY IF EXISTS "public insert options" ON public.dropdown_options;
DROP POLICY IF EXISTS "public update options" ON public.dropdown_options;
DROP POLICY IF EXISTS "public delete options" ON public.dropdown_options;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dropdown_options TO assets_authenticated;
DROP POLICY IF EXISTS "centralhub read options" ON public.dropdown_options;
CREATE POLICY "centralhub read options" ON public.dropdown_options FOR SELECT USING (public.centralhub_perm('read'));
DROP POLICY IF EXISTS "centralhub insert options" ON public.dropdown_options;
CREATE POLICY "centralhub insert options" ON public.dropdown_options FOR INSERT WITH CHECK (public.centralhub_perm('write'));
DROP POLICY IF EXISTS "centralhub update options" ON public.dropdown_options;
CREATE POLICY "centralhub update options" ON public.dropdown_options FOR UPDATE USING (public.centralhub_perm('edit')) WITH CHECK (public.centralhub_perm('edit'));
DROP POLICY IF EXISTS "centralhub delete options" ON public.dropdown_options;
CREATE POLICY "centralhub delete options" ON public.dropdown_options FOR DELETE USING (public.centralhub_perm('delete'));

-- doc_number_sequences: stays locked down entirely (matches the exported
-- 20260604035455 migration's own intent) — reachable only via the
-- SECURITY DEFINER generate_doc_number()/peek_next_doc_number() functions,
-- not directly through PostgREST.
DROP POLICY IF EXISTS "public all seq" ON public.doc_number_sequences;
REVOKE ALL ON public.doc_number_sequences FROM assets_anon, assets_authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_doc_number() TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.peek_next_doc_number() TO assets_authenticated;

-- role_assignments (the app's own internal workflow-role/password system —
-- unrelated to CentralHub identity, left functionally untouched; only the
-- table-level RLS gap closes here)
DROP POLICY IF EXISTS "public read roles" ON public.role_assignments;
DROP POLICY IF EXISTS "public insert roles" ON public.role_assignments;
DROP POLICY IF EXISTS "public update roles" ON public.role_assignments;
DROP POLICY IF EXISTS "public delete roles" ON public.role_assignments;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_assignments TO assets_authenticated;
REVOKE SELECT (password_hash) ON public.role_assignments FROM assets_authenticated, PUBLIC;
DROP POLICY IF EXISTS "centralhub read roles" ON public.role_assignments;
CREATE POLICY "centralhub read roles" ON public.role_assignments FOR SELECT USING (public.centralhub_perm('read'));
DROP POLICY IF EXISTS "centralhub insert roles" ON public.role_assignments;
CREATE POLICY "centralhub insert roles" ON public.role_assignments FOR INSERT WITH CHECK (public.centralhub_perm('write'));
DROP POLICY IF EXISTS "centralhub update roles" ON public.role_assignments;
CREATE POLICY "centralhub update roles" ON public.role_assignments FOR UPDATE USING (public.centralhub_perm('edit')) WITH CHECK (public.centralhub_perm('edit'));
DROP POLICY IF EXISTS "centralhub delete roles" ON public.role_assignments;
CREATE POLICY "centralhub delete roles" ON public.role_assignments FOR DELETE USING (public.centralhub_perm('delete'));
GRANT EXECUTE ON FUNCTION public.verify_role_login(text, text) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.verify_person_password(text, text) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.person_exists(text) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, text, text, integer[], boolean) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(text, text, text, text, integer[], boolean, boolean) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(text, text, text) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_password(text, text, text, text) TO assets_authenticated;

-- department_passwords
DROP POLICY IF EXISTS "public read dept pw" ON public.department_passwords;
DROP POLICY IF EXISTS "public insert dept pw" ON public.department_passwords;
DROP POLICY IF EXISTS "public update dept pw" ON public.department_passwords;
DROP POLICY IF EXISTS "public delete dept pw" ON public.department_passwords;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.department_passwords TO assets_authenticated;
REVOKE SELECT (password_hash) ON public.department_passwords FROM assets_authenticated, PUBLIC;
DROP POLICY IF EXISTS "centralhub read dept pw" ON public.department_passwords;
CREATE POLICY "centralhub read dept pw" ON public.department_passwords FOR SELECT USING (public.centralhub_perm('read'));
DROP POLICY IF EXISTS "centralhub insert dept pw" ON public.department_passwords;
CREATE POLICY "centralhub insert dept pw" ON public.department_passwords FOR INSERT WITH CHECK (public.centralhub_perm('write'));
DROP POLICY IF EXISTS "centralhub update dept pw" ON public.department_passwords;
CREATE POLICY "centralhub update dept pw" ON public.department_passwords FOR UPDATE USING (public.centralhub_perm('edit')) WITH CHECK (public.centralhub_perm('edit'));
DROP POLICY IF EXISTS "centralhub delete dept pw" ON public.department_passwords;
CREATE POLICY "centralhub delete dept pw" ON public.department_passwords FOR DELETE USING (public.centralhub_perm('delete'));

-- person_receive_passwords
DROP POLICY IF EXISTS "public read prp" ON public.person_receive_passwords;
DROP POLICY IF EXISTS "public insert prp" ON public.person_receive_passwords;
DROP POLICY IF EXISTS "public update prp" ON public.person_receive_passwords;
DROP POLICY IF EXISTS "public delete prp" ON public.person_receive_passwords;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_receive_passwords TO assets_authenticated;
REVOKE SELECT (password_hash) ON public.person_receive_passwords FROM assets_authenticated, PUBLIC;
DROP POLICY IF EXISTS "centralhub read prp" ON public.person_receive_passwords;
CREATE POLICY "centralhub read prp" ON public.person_receive_passwords FOR SELECT USING (public.centralhub_perm('read'));
DROP POLICY IF EXISTS "centralhub insert prp" ON public.person_receive_passwords;
CREATE POLICY "centralhub insert prp" ON public.person_receive_passwords FOR INSERT WITH CHECK (public.centralhub_perm('write'));
DROP POLICY IF EXISTS "centralhub update prp" ON public.person_receive_passwords;
CREATE POLICY "centralhub update prp" ON public.person_receive_passwords FOR UPDATE USING (public.centralhub_perm('edit')) WITH CHECK (public.centralhub_perm('edit'));
DROP POLICY IF EXISTS "centralhub delete prp" ON public.person_receive_passwords;
CREATE POLICY "centralhub delete prp" ON public.person_receive_passwords FOR DELETE USING (public.centralhub_perm('delete'));

-- asset_transfer_history
DROP POLICY IF EXISTS "public read transfer history" ON public.asset_transfer_history;
DROP POLICY IF EXISTS "public insert transfer history" ON public.asset_transfer_history;
DROP POLICY IF EXISTS "public update transfer history" ON public.asset_transfer_history;
DROP POLICY IF EXISTS "public delete transfer history" ON public.asset_transfer_history;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_transfer_history TO assets_authenticated;
DROP POLICY IF EXISTS "centralhub read transfer history" ON public.asset_transfer_history;
CREATE POLICY "centralhub read transfer history" ON public.asset_transfer_history FOR SELECT USING (public.centralhub_perm('read'));
DROP POLICY IF EXISTS "centralhub insert transfer history" ON public.asset_transfer_history;
CREATE POLICY "centralhub insert transfer history" ON public.asset_transfer_history FOR INSERT WITH CHECK (public.centralhub_perm('write'));
DROP POLICY IF EXISTS "centralhub update transfer history" ON public.asset_transfer_history;
CREATE POLICY "centralhub update transfer history" ON public.asset_transfer_history FOR UPDATE USING (public.centralhub_perm('edit')) WITH CHECK (public.centralhub_perm('edit'));
DROP POLICY IF EXISTS "centralhub delete transfer history" ON public.asset_transfer_history;
CREATE POLICY "centralhub delete transfer history" ON public.asset_transfer_history FOR DELETE USING (public.centralhub_perm('delete'));

-- Storage bucket + policies — created here, not in the exported migrations,
-- because the `storage` schema doesn't exist until storage-assets
-- (supabase/storage-api) bootstraps it on first start. See
-- apps/assets/scripts/migrate.sh for the wait/ordering.
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
