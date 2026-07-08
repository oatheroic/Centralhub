#!/bin/sh
# One-shot migration runner for assets-db. Two phases, in order:
#
# 1. Apply the exported Lovable migrations (apps/assets/supabase/migrations/
#    *.sql, filename order) against the public schema, with any storage.*
#    statement stripped out — the `storage` schema doesn't exist until
#    storage-assets (supabase/storage-api) bootstraps it on its own first
#    start, which hasn't necessarily happened yet at this point.
# 2. Wait for storage-assets to report healthy, then apply the CentralHub
#    RLS-rewrite migration (20260707000000_centralhub_rls.sql) — the one
#    migration NOT filtered, since it's what creates the storage bucket and
#    its real policies, and by design must run last.
set -eu

MIGRATIONS_DIR="/migrations"
REWRITE_FILE="20260707000000_centralhub_rls.sql"

echo "assets-migrate: waiting for assets-db..."
until pg_isready -q; do sleep 2; done

# The exported migrations aren't idempotent (plain CREATE TABLE, no IF NOT
# EXISTS) — fine for a genuinely fresh volume, but a container restart
# against an already-migrated volume would otherwise fail loudly on the
# very first file. asset_purchase_requests existing is a reliable signal
# the exported migrations already ran; the rewrite migration below IS safe
# to reapply (DROP POLICY IF EXISTS / CREATE OR REPLACE throughout) and
# always runs.
ALREADY_MIGRATED=$(psql -tAc "SELECT to_regclass('public.asset_purchase_requests') IS NOT NULL")

if [ "$ALREADY_MIGRATED" = "t" ]; then
  echo "assets-migrate: exported migrations already applied, skipping to rewrite..."
else
  echo "assets-migrate: applying exported migrations (storage.* statements stripped)..."
  for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    base=$(basename "$f")
    if [ "$base" = "$REWRITE_FILE" ]; then
      continue
    fi
    echo "assets-migrate:   $base"
    grep -viE "storage\.(buckets|objects)" "$f" | psql -v ON_ERROR_STOP=1 -q
  done
fi

echo "assets-migrate: waiting for storage-assets..."
until wget -q -O /dev/null "$STORAGE_HEALTH_URL"; do sleep 2; done

echo "assets-migrate: applying CentralHub RLS rewrite + storage bucket/policies..."
psql -v ON_ERROR_STOP=1 -q -f "$MIGRATIONS_DIR/$REWRITE_FILE"

echo "assets-migrate: done."
