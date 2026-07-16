-- RLS + grants for apps/assets, applied after 20260707000000_schema.sql.
-- Every exported migration's own policy was USING (true)/WITH CHECK (true)
-- — RLS was enabled but enforced nothing; the (public, bundle-embedded)
-- anon key alone could read/write/delete any row. This file replaces that
-- with real checks against the JWT that auth-gateway's GET /auth/data-token
-- mints (see services/auth-gateway), signed with the same PGRST_JWT_SECRET
-- postgrest-assets verifies.
--
-- The minted JWT's shape is: { "role": "assets_authenticated", "sub": "<centralhub user id>",
-- "perm": { "read": bool, "write": bool, "edit": bool, "delete": bool } }
-- — the same four-verb model every other app's app_permissions row already
-- uses (see services/auth-gateway/src/permissions.ts).
--
-- Idempotent throughout (DROP POLICY IF EXISTS + CREATE), so this re-applies
-- cleanly on every container start alongside the schema file — no
-- "already migrated" guard needed. See 20260707000002_storage.sql for the
-- storage-schema counterpart, applied separately since that schema doesn't
-- exist until storage-assets bootstraps it.

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

-- doc_number_sequences: stays locked down entirely — reachable only via the
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
GRANT EXECUTE ON FUNCTION public.verify_department_password(text, text) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.set_department_password(text, text, text, text) TO assets_authenticated;

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
GRANT EXECUTE ON FUNCTION public.verify_person_receive_password(text, text) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_person_receive_password(text, text, text, text) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_person_receive_active(text, text, text, boolean) TO assets_authenticated;
GRANT EXECUTE ON FUNCTION public.admin_rename_person_receive(text, text, text, text) TO assets_authenticated;

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
