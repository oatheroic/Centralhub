#!/bin/sh
# One-shot migration runner for assets-db. Two phases, in order:
#
# 1. Apply 20260707000000_schema.sql and 20260707000001_rls.sql — every
#    statement in both is idempotent (IF NOT EXISTS / OR REPLACE / DROP
#    POLICY IF EXISTS+CREATE / ON CONFLICT), so they're simply re-applied on
#    every container start; no "is this already migrated" check needed.
# 2. Wait for storage-assets to report healthy, then apply
#    20260707000002_storage.sql — split out because the `storage` schema it
#    references doesn't exist until storage-assets (supabase/storage-api)
#    bootstraps it on its own first start.
#
# These 3 files replace the 32 originally-exported Lovable migrations
# (applied as history, 2026-05-04 through 2026-06-22) plus the
# 20260707000000_centralhub_rls.sql rewrite that used to run after them —
# see 20260707000000_schema.sql's header for why a clean rewrite was safe
# here (nothing in the export ever dropped a column/table/function), and
# apps/engineering/scripts/migrate.sh, which this now mirrors exactly.
set -eu

MIGRATIONS_DIR="/migrations"

echo "assets-migrate: waiting for assets-db..."
until pg_isready -q; do sleep 2; done

echo "assets-migrate: applying schema + RLS..."
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/20260707000000_schema.sql"
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/20260707000001_rls.sql"

echo "assets-migrate: waiting for storage-assets..."
until wget -q -O /dev/null "$STORAGE_HEALTH_URL"; do sleep 2; done

echo "assets-migrate: applying storage bucket + policies..."
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/20260707000002_storage.sql"

# postgrest-assets caches its schema at boot — it starts in parallel with
# this migrator (both only depend on assets-db), so its first cache is taken
# before some of the tables/functions above exist, and every PostgREST call
# 404s until it reloads. NOTIFY on the "pgrst" channel is PostgREST's own
# documented reload signal — no restart needed. (apps/engineering already
# does this; porting it here closes the same latent race in this app.)
echo "assets-migrate: notifying postgrest-assets to reload its schema cache..."
psql -v ON_ERROR_STOP=1 -q -c "NOTIFY pgrst, 'reload schema';"

echo "assets-migrate: done."
