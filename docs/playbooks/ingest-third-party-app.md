# Playbook: ingest a third-party app

The distilled procedure for onboarding a new externally-built app. Start here, not in the per-app history.

> Part of the [CentralHub documentation](../../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

---

## 10c. General guidelines for ingesting a third-party app

Consolidated from §10 (`apps/assets`) and §10b (`apps/engineering`) — the
playbook for onboarding the *next* one. Those two sections are left as
written above (a record of what each ingestion actually did, warts
included); this section is the distilled, forward-looking checklist.

**Guiding principle, stated once so it doesn't need repeating per step
below: prefer a clean rewrite that matches this repo's actual architecture
and source of truth over patching the export in place, even when the patch
is less work.** `apps/engineering`'s first pass kept the 14 exported
migration files byte-identical and layered a filtering/ordering shim on
top (line-stripping `storage.*`/Realtime statements at apply time, a
bootstrap copy of `auth.uid()` purely for ordering); the second pass threw
that away and wrote three clean, idempotent migration files reflecting the
end state directly. The clean version was strictly better — no ordering
gotchas, no fragile text-filtering, dead columns actually gone instead of
inert — for the same reason every time: once an ingestion is rewriting the
auth model, the role model, and dropping features, "preserve the export
byte-for-byte" stops being a real constraint and starts being an
accumulating tax. Reach for the patch-in-place approach only when the
export's own logic is being kept essentially as-is (e.g. `apps/assets`'
table/column definitions were never touched, only its RLS layer) — not by
default.

**1. End state, regardless of what came in**: the app runs entirely on
this repo's own infrastructure — its own Postgres + PostgREST + storage-api
— reachable through the existing gateway/auth/RBAC, with no ongoing
dependency on the SaaS platform (Supabase, Lovable's connector-gateway, or
anything else) it was exported from or built against.

**2. Pick the enforcement model first.** Use §7's "Choosing an enforcement
model: native gate vs. minted-JWT/RLS" decision tree. Both ingestions so
far landed on minted-JWT/RLS (untrusted third-party code, needs row-level
enforcement) — that won't always be the answer, but decide it explicitly
before writing anything.

**3. Audit every external dependency the export brought with it, and
decide its fate explicitly** — don't leave any of them running against
their original SaaS endpoint, and don't silently work around one without
recording the decision:
   - **Auth**: if it's real (its own login, its own session), retire it —
     CentralHub is the only login for every app in this repo. If it was
     already a no-op (like `apps/assets`' RPC-based "login"), there's
     nothing to retire.
   - **Realtime/websocket/notification integrations**: almost always worth
     dropping or deferring rather than self-hosting a whole extra service
     for one feature — document it in §13 rather than leaving a dangling
     client-side subscription that quietly does nothing (harmless, but
     worth being honest about in the deferred catalog).
   - **Third-party connector/webhook integrations** (Sheets, Slack, email,
     etc.): drop by default. Only re-home to a direct API if the feature is
     load-bearing for the business and a session explicitly decides so —
     don't reflexively "port" it.
   - **Any other SaaS the export's own admin/session logic depended on**:
     same treatment — retire, and replace with the equivalent CentralHub
     mechanism if one already exists (see step 5), rather than rebuilding a
     parallel one.

**4. Self-hosted data layer — mirror the existing shape exactly**:
   - A dedicated Postgres (`<app>-db`), PostgREST (`postgrest-<app>`), and
     `supabase/storage-api` (`storage-<app>`) in `docker-compose.yml`, own
     volumes, own `.env` vars (`<APP>_DB_PASSWORD`, `<APP>_STORAGE_ANON_KEY`,
     `<APP>_STORAGE_SERVICE_KEY`, all sharing the one `PGRST_JWT_SECRET`).
   - `apps/<app>/scripts/init-roles.sql` (storage-api's own bootstrap
     roles — `anon`/`authenticated`/`service_role`, hardcoded by
     storage-api itself, unrelated to the app-specific PostgREST roles
     below), `migrate.sh`, and a `Dockerfile` building the one-shot
     `<app>-migrate` service.
   - Nginx: a generic `/apps/<app>/` block (free, per Pillar 2) plus two
     `^~ /apps/<app>/api/rest/v1/` / `/storage/v1/` blocks proxying to
     `postgrest-<app>`/`storage-<app>` — copy the `apps/assets` blocks in
     `gateway/conf.d/default.conf` verbatim, s/assets/<app>/.

**5. Migrations — write them fresh, per the guiding principle above**:
   - Read the export's migrations once to extract the *end-state* schema
     (final columns, final function bodies, final indexes) — don't apply
     them as a history. Drop anything only needed for a dependency you
     retired in step 3 (single-session columns, workflow-login tables,
     Realtime-enabling statements) — actually drop, don't leave inert.
   - Write 2-3 clean files: a schema file (enums/tables/indexes/functions/
     triggers), an RLS+grants file (roles, policies, `EXECUTE` grants —
     **don't forget these**: if the export's own migrations `REVOKE
     EXECUTE ... FROM PUBLIC` on any function your policies call, the new
     `<app>_authenticated` role needs an explicit re-grant or every query
     fails closed with a bare "permission denied for function ..."), and a
     storage file (bucket + policies, since the `storage` schema doesn't
     exist until `storage-<app>` bootstraps it on first start — this is
     the one genuine ordering constraint, not a workaround).
   - Every statement idempotent (`CREATE ... IF NOT EXISTS`, `CREATE OR
     REPLACE FUNCTION`/`TRIGGER`, `DROP POLICY IF EXISTS` + `CREATE`,
     `INSERT ... ON CONFLICT DO NOTHING`) so `migrate.sh` can simply
     re-apply every file on every container start — no "is this already
     migrated" guard, no text-filtering, no bootstrap-for-ordering shim.
   - `auth.uid()` needs a fresh `auth` schema (self-hosted Postgres has no
     built-in one) reading the minted JWT's `sub` claim — define it once,
     in the schema file, before anything that calls it; there is no
     "apply it twice for ordering" if the schema file is the first thing
     applied.
   - Name the directory `apps/<app>/db/migrations/`, not
     `apps/<app>/supabase/migrations/` — and delete the export's own
     `supabase/config.toml` (a hosted-project-id pointer). Neither the
     Supabase CLI nor the hosted project is involved once self-hosted.

**6. Identity, role, and department mapping — CentralHub's own
`user_attributes`/admin UI never change shape for a new app**:
   - Extend `GET /auth/data-token` (`services/auth-gateway/src/routes/
     dataToken.ts`) with whatever extra claims the app's RLS needs
     (`role_code` and `dept_name` already flow generically to every app;
     add more only if a specific app's policies need them).
   - Role resolution: `resolveRoleCode()` already checks a per-user
     `app_role_overrides` row first, then `app_role_rules` (attribute-based,
     most-specific-match-wins) — both generic, reusable as-is. A new app
     only adds rows to these tables (via its own admin panel calling the
     existing generic `/admin/apps/:appId/role-rules` and
     `/admin/apps/:appId/role-overrides` routes), never a new auth-gateway
     table for its own role vocabulary. The overrides endpoint already
     rejects a caller targeting their own `user_sub` (an override always
     beats the rules, so self-targeting to a non-admin role_code has no
     recovery path — see §10b's "self-lockout guard") — a new app's own
     admin panel should also exclude the logged-in admin from its override
     user-picker, the same UX guard `RoleRulesPanel.tsx` applies, so this
     mistake stays hard to make rather than only caught server-side.
   - Anything that's genuinely specific to the new app (e.g.
     `apps/engineering`'s CentralHub-department-string → its own
     `departments.id` mapping) lives entirely inside that app's own
     database, managed via a plain PostgREST call from that app's admin
     panel — not bolted onto auth-gateway. The test: would a *second* app
     ever need this same mapping? If yes, it belongs in auth-gateway
     (generic); if it's this app's own concept, it belongs in that app's
     own DB.
   - Register the app by giving it an `app.manifest.json`; the
     `apps-manifest-sync` one-shot service upserts it into the `apps` table
     on stack start (§12b). **This replaced the old three-places-by-hand
     step** — there is no longer a `KNOWN_APPS` constant in
     `services/auth-gateway/src/permissions.ts`, and
     `apps/central-hub/src/registry/apps.ts` is no longer hand-maintained.
     Two fields are deliberately *not* settable from a manifest, because
     they affect real authorization: `known_app` (permission-matrix
     membership) and `admin_role_code` (which local role code means "admin
     of this app"). Set those in `apps/admin`'s Apps tab. Leaving
     `admin_role_code` unset is fine and means the app simply has no local
     admins — a CentralHub platform admin is still an admin there
     unconditionally (§7).
   - Seed dev data: a `dev-admin`/`dev-user` permission row
     (`seedDevPermissions()`) and at least one `app_role_rules` demo row
     (`seedDevAttributes()`) so a fresh `docker compose up` demonstrates
     the new app working without manual setup.

**7. Frontend conversion**: convert to a static Vite SPA behind Nginx
regardless of what the export shipped (SSR, a different bundler, etc.) —
no app in this repo has server-side logic worth preserving once its own
auth/session/SaaS-connector layer is gone. Copy `apps/assets`' `vite.config.ts`
shape (`base: "/apps/<app>/"`, plain `react()`/`tailwindcss()`/
`tsconfigPaths()` plugins) and `Dockerfile` (multi-stage `pnpm build` →
`nginx:1.27-alpine`). If the export's own design system conflicts with
`packages/ui`'s React peer dependency, keep the export's stack and only
share `packages/ui/src/tokens.css` + the React-free `@centralhub/ui/theme`
subpath for chrome, exactly like `AssetsNav.tsx`/`AppHeader.tsx` do — don't
force a peer-dependency downgrade to adopt the shared component library.

**8. Verify against the real running stack, not just a typecheck**: fresh
`docker compose up`, confirm every one-shot `<app>-migrate` exits 0, drive
the actual Keycloak Authorization Code flow for both `dev-admin` and
`dev-user` (a plain Node `fetch` script, see `scripts/test-stack.mjs`),
confirm `GET /auth/data-token?app=<app>` resolves the expected role/claims,
and confirm an RLS boundary actually holds (a read-denied query returns
`[]`/`403`, not just "the client hides the button"). Extend
`scripts/test-stack.mjs` with the new app's assertions once it's working.

**9. Final cleanup pass — before calling the ingestion done**: the steps
above focus on getting the app working; do a separate pass afterward
looking specifically for leftovers, since none of steps 1-8 will catch
these on their own (`apps/engineering` shipped all of the following on its
first pass, caught only in a dedicated cleanup afterward):
   - **Dark mode**: if the export's stylesheet declares `@custom-variant
     dark (&:is(.dark *))` (shadcn/Tailwind v4's convention), check there's
     an actual `.dark { ... }` block overriding every color variable the
     `:root` block sets — declaring the variant without the override block
     means the toggle button *runs* (adds/removes the class) but visibly
     does nothing, which reads as "broken" rather than "unfinished" to
     whoever notices. Also grep for hardcoded color literals (a
     `linear-gradient(...)` on `body`, an inline hex/oklch) that bypass the
     theme variables entirely — they'll keep fighting a correct `.dark`
     block even after it's added.
   - **Dead scaffolding references**: after step 7 converts the export to
     a plain Vite SPA, its `.gitignore` and lint config (`eslint.config.js`,
     etc.) often still reference the framework that was just removed
     (TanStack Start/Nitro/Vinxi build output, Cloudflare Wrangler, a
     `no-restricted-imports` rule about a Next.js-specific package) —
     harmless (they just never match anything again) but worth trimming so
     a future reader doesn't infer this app still targets that stack.
   - **Stray files from the ingestion work itself**: check for
     tooling-quirk leftovers like a duplicated nested directory from a
     write that didn't land where intended (`find apps/<app> -type f | sort`
     and eyeball it, or diff any suspicious duplicate paths) — these are
     easy to introduce mid-session and easy to miss since the app still
     builds fine with them present.
   - **Lockfile hygiene**: this repo is a single pnpm workspace
     (`pnpm-workspace.yaml`) — delete whatever lockfile the export shipped
     with for a different package manager (`bun.lock`, `yarn.lock`,
     `package-lock.json`); a second lockfile in an app directory implies a
     second install path that doesn't actually exist here.

**10. Archive a snapshot of the raw export, for future diffing.** §10d
depends on this existing — a future Lovable update can only be diffed
against what this ingestion actually started from if that starting point was
kept. Skipping this step doesn't block the current ingestion, but it forces
a full re-ingestion later instead of a scoped update, since there'll be
nothing to diff against.
   - Location: `apps/<app>/archive/<YYYYMMDD>-baseline/`, where the date is
     the same one already chosen for this ingestion's first migration file's
     timestamp prefix (step 5) — the snapshot and the migrations it produced
     stay correlated by construction, no separate version number to invent
     or keep in sync by hand.
   - Contents: the raw export's source tree, placed directly under the
     dated directory (no extra nested project-name folder) — `src/`,
     `supabase/migrations/` (or wherever the export puts its schema),
     `package.json`, and its build/tooling config (`vite.config.ts`,
     `tsconfig.json`, `eslint.config.js`, `components.json`, `.prettierrc`,
     etc.). Keep these even though step 7 converts the app away from them —
     they're what a future diff needs to detect, e.g., "Lovable changed its
     shadcn config."
   - Strip before committing (regenerable, tool-specific to a stack this
     repo doesn't run, or credential-shaped — none of it has diff value, all
     of it is either bloat or a leak risk):
     - `.env` — the export's hosted-Supabase URL/keys. Even a
       publishable/anon key is project-specific and meaningless once
       self-hosted; note the project ref in the archive's own `README.md`
       instead of keeping the file.
     - Lockfiles for a package manager this workspace doesn't use
       (`bun.lockb`, `bun.lock`, `yarn.lock`) — `package.json` alone
       captures dependency intent; a lockfile is large, binary or
       near-binary, and diffs badly.
     - Deploy-target config for a runtime this app won't run on
       (`wrangler.jsonc` for Cloudflare Workers, etc.).
     - Generated files (`src/routeTree.gen.ts` or equivalent router
       codegen, build output directories) — pure build artifacts,
       regenerated from source, never hand-edited upstream either.
     - `node_modules/`, `dist/`, `.output/`, or any other build/install
       directory, if the export included one.
   - Add (or update) `apps/<app>/archive/README.md`: a short index listing
     each snapshot directory, what it corresponds to (which ingestion or
     update pass, the matching migration timestamp prefix), the original
     project name and hosted-project ref, and exactly what was stripped from
     that snapshot and why — so a future reader isn't left guessing whether
     something's absence was deliberate.
   - This step is retroactive-safe: if an ingestion shipped without a
     snapshot, add one later the same way, dated to when it's actually
     added (not backdated) — a late baseline is still strictly better than
     none, it just can't be used to diff anything that changed before it
     was taken.

---

---
