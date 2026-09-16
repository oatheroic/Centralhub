#!/bin/sh
# Runs upload-images.mjs inside a throwaway node container joined to the
# compose network, so it can reach storage-engineering:5000 with the
# service key from environments/.env. Run from the repo root on the machine
# whose stack you're importing into (dev or production — same command):
#
#   sh apps/engineering/db/import/upload-images.sh
#
# Assumes the compose project is named "centralhub" (docker-compose.yml's
# `name:`); override with COMPOSE_NETWORK if not.
set -eu
# Git Bash on Windows rewrites /app/... container paths to C:/Program Files/Git/app/... otherwise.
export MSYS_NO_PATHCONV=1
cd "$(dirname "$0")/../../../.."
KEY=$(grep '^ENGINEERING_STORAGE_SERVICE_KEY=' environments/.env | cut -d= -f2-)
[ -n "$KEY" ] || { echo "ENGINEERING_STORAGE_SERVICE_KEY not set in environments/.env" >&2; exit 2; }
docker run --rm \
  --network "${COMPOSE_NETWORK:-centralhub_centralhub}" \
  -v "$(pwd)/apps/engineering:/app/apps/engineering:ro" \
  -e STORAGE_SERVICE_KEY="$KEY" \
  -e STORAGE_URL="${STORAGE_URL:-http://storage-engineering:5000}" \
  node:24-alpine node /app/apps/engineering/db/import/upload-images.mjs
