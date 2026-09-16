# `apps/engineering` — original-codebase archive

Snapshots of the Lovable export this app was built from, kept **only** so a
future update from Lovable can be diffed against the exact version this app
was last ingested/patched from. See the main README's §10c ("Archiving a
snapshot for future diffing") and §10d ("Updating an already-ingested
third-party app") for how this is used and maintained — this file just
indexes what's here.

## Snapshots

| Directory | Corresponds to | Source |
|---|---|---|
| `20260716-baseline/` | Initial ingestion (§10b) — matches the `20260716*` migration timestamp prefix in `apps/engineering/db/migrations/` | Lovable export, project name "fix-hand-off-main" / "BigOne" (`bgone`), hosted Supabase project ref `xhkjaeapzuzvequgdode` |
| `20260915-update/` | First post-ingestion update (§10d) — the repair-scheduling feature + UI polish, matches the `20260915*` migration timestamp prefix. `data/` holds the hosted instance's table exports taken the same day (see below) | Same Lovable project, re-exported 2026-09-15; hosted project ref unchanged |

## `20260915-update/data/` — hosted-instance table exports (NOT imported)

Semicolon-delimited CSVs exported from the hosted Supabase project's
dashboard on 2026-09-15, one per table: `departments`, `machine_types`,
`machines`, `repair_jobs`, `parts_requisitions`, `profiles`,
`user_roles`. Kept here **as reference data only** — none of it has been
loaded into `engineering-db`, deliberately: every row that references a
person carries a hosted Supabase Auth uid, which has no equivalent in
CentralHub until the matching Keycloak users exist and a uid → Keycloak-sub
mapping is provided, and the hosted `departments` table mixes this app's
own repair sub-groups with company departments that CentralHub's platform
`attribute_values` list is meant to own. Importing before those mappings
exist would mean NULLed FKs and throwaway "legacy name" columns; the
decision was to wait and import once, cleanly. The main README's §13 lists
the exact prerequisites. Notes for whoever does that import:

- Some fields contain literal tab characters (e.g. `part_code`); empty
  string means NULL; `parts_used` is JSON with doubled quotes.
- `profiles.csv` still has the three columns this ingestion dropped
  (`active_session_id`, `active_session_seen_at`, `allowed_repair_dept_ids`)
  — ignore them. The session ids are long-dead hosted-session tokens, not
  credentials.
- `repair_jobs.csv` already includes the scheduling columns this update's
  migration adds, so it loads against the post-update schema as-is.

### `20260915-update/data/repair-images/` — mirrored bucket objects (2026-09-16)

The 292 photos `repair_jobs.csv` references (`image_url` /
`completed_image_url`, 293 refs, all on the hosted project's public
`repair-images` bucket) were pulled down on 2026-09-16 by
`apps/engineering/db/import/fetch-images.mjs`, keyed exactly as in the
hosted bucket (`<hosted-uid>/<timestamp>_<name>.<ext>`). Only
`manifest.json` is tracked (key, source URL, referencing job ids, bytes,
sha256, content type, per-object status — none were missing upstream);
the ~375 MB of raw files are gitignored and re-fetched with the same
script (idempotent — skips what's already on disk at the recorded size)
while the hosted bucket is still up, or copied from another machine and
checked against the manifest.

`repair-images-normalized/` (also gitignored, regenerable) is what actually
gets served: `db/import/normalize-images.mjs` runs every raw object through
the same policy the app now applies client-side on upload
(`src/lib/imageUpload.ts` — EXIF-rotated, ≤1600px, JPEG stepped down to
~350 KB, smallest result kept if that can't be hit), writing
`<same key>.jpg` and a `normalized` block per object into the manifest.
Two decoders: `sharp` for JPEG/PNG, `heic-convert` (pure-WASM libheif +
libde265) for the 5 iPhone HEICs sharp's prebuilt libheif can't decode.
Result: 375 MB → 52.5 MB, every object ≤385 KB and browser-renderable.

Unlike the CSVs, these have already been loaded: `db/import/upload-images.sh`
pushes the normalized set into a stack's `storage-engineering` under the
`.jpg` keys (run against dev 2026-09-16; re-run against production
alongside the row import — same command, it's idempotent and also removes
any raw-key leftovers from an earlier run). The row import rewrites each
URL with `lib.mjs`'s `rewriteImageUrl(url, manifest)` — hosted URL →
root-relative `/apps/engineering/api/storage/v1/object/public/repair-images/<normalized key>`.
A row whose image was never mirrored is still imported with its rewritten
(dead) link rather than held.

## What was stripped from the raw export, and why

Every snapshot above has already had the following removed before being
committed, per §10c's archiving guideline — none of it is needed to diff
source/schema changes, and all of it is either regenerable, tool-specific to
a stack this repo doesn't use, or credential-shaped:

- `.env` — held the hosted Supabase project's URL + publishable (anon) key.
  Not a service-role secret, but project-specific and irrelevant once
  self-hosted; the project ref is recorded above instead.
- `bun.lock` — lockfile from a package manager this workspace doesn't use
  (`pnpm`); `package.json` alone is enough to diff dependency intent.
- `bunfig.toml`, `wrangler.jsonc` — bun and Cloudflare Workers config; this
  app runs as a static Vite SPA behind Nginx, neither applies.
- `src/routeTree.gen.ts` — TanStack Router's generated route tree; pure
  build output, regenerated from `src/routes/` on build.

Kept, including two files worth calling out specifically:

- `.lovable/project.json`, `.lovable/plan.md` — Lovable's own project
  metadata (template id, build plan). Tiny, and useful context for what
  Lovable itself thought the app was — kept as-is.
- `src/server.ts`, `src/start.ts` — the original TanStack Start SSR entry
  points, dropped from the live app (§10b converted this to a static SPA)
  but kept here since a future export's SSR-layer changes are still worth
  seeing in a diff even though nothing on the live side consumes them.

Everything else (`src/`, `supabase/migrations/`, `supabase/config.toml`,
`package.json`, tsconfig/vite/eslint/prettier/components.json configs,
`public/`) is kept byte-for-byte as exported, since any of it could be what
changes in a future update.

**Never restore the `.env` file here or commit real credentials into a new
snapshot** — if a future export includes one, strip it the same way before
committing.
