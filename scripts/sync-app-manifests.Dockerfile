# syntax=docker/dockerfile:1
#
# One-shot container for the apps-manifest-sync compose service — see
# environments/docker-compose.yml. Only the sync script itself is baked
# into the image; the manifests it reads are bind-mounted read-only at
# runtime (../apps:/manifests:ro), not copied in, so editing a manifest
# never requires a rebuild.
FROM node:20-alpine
COPY scripts/sync-app-manifests.mjs /sync-app-manifests.mjs
ENTRYPOINT ["node", "/sync-app-manifests.mjs"]
