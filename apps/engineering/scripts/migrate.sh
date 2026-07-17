#!/bin/sh
# One-shot migration runner for engineering-db. Two phases, in order:
#
# 1. Apply 20260716000000_schema.sql, 20260716000001_rls.sql,
#    20260717000000_dept_user_overrides.sql, and 20260717000001_audit_log.sql
#    — every statement across all four is idempotent (IF NOT EXISTS /
#    OR REPLACE / DROP POLICY IF EXISTS+CREATE / ON CONFLICT), so they're
#    simply re-applied on every container start; no "is this already
#    migrated" check needed.
# 2. Wait for storage-engineering to report healthy, then apply
#    20260716000002_storage.sql — split out because the `storage` schema
#    it references doesn't exist until storage-engineering (supabase/
#    storage-api) bootstraps it on its own first start.
#
# Unlike apps/assets (which applies Lovable's own exported migrations,
# patched only where the storage schema wasn't ready yet), this app's
# migrations are written fresh for self-hosted Postgres from the start —
# see 20260716000000_schema.sql's header for why patching the export in
# place would have meant carrying line-filtering/ordering workarounds
# indefinitely instead of just writing the end state directly.
set -eu

MIGRATIONS_DIR="/migrations"

echo "engineering-migrate: waiting for engineering-db..."
until pg_isready -q; do sleep 2; done

echo "engineering-migrate: applying schema + RLS..."
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/20260716000000_schema.sql"
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/20260716000001_rls.sql"
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/20260717000000_dept_user_overrides.sql"
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/20260717000001_audit_log.sql"

echo "engineering-migrate: waiting for storage-engineering..."
until wget -q -O /dev/null "$STORAGE_HEALTH_URL"; do sleep 2; done

echo "engineering-migrate: applying storage bucket + policies..."
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/20260716000002_storage.sql"

# postgrest-engineering caches its schema at boot — it starts in parallel
# with this migrator (both only depend on engineering-db), so its first
# cache is taken before ensure_profile() and the other tables/functions
# above exist, and every PostgREST call 404s until it reloads. NOTIFY on
# the "pgrst" channel is PostgREST's own documented reload signal — no
# restart needed.
echo "engineering-migrate: notifying postgrest-engineering to reload its schema cache..."
psql -v ON_ERROR_STOP=1 -q -c "NOTIFY pgrst, 'reload schema';"

echo "engineering-migrate: done."
