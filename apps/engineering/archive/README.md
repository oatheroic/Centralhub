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

No update snapshots yet — this app hasn't been re-pulled from Lovable since
ingestion.

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
