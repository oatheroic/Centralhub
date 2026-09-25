# History: apps/assets ingestion

What the first third-party ingestion actually did, warts and all. The reusable lessons are in the playbook; this is the record.

> Part of the [CentralHub documentation](../../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

---

## 10. Third-party app ingestion (`apps/assets`)

- **Objective**: onboarding an externally-built app (a Lovable/similar export)
  should end with it running entirely on our own infrastructure — no ongoing
  dependency on the SaaS backend it was built against — while still being a
  small, mechanical, well-documented change, matching every other pillar's bar.
- **What came in**: `apps/assets` is a real Lovable export — TanStack Start
  (SSR) on React 19/Tailwind v4, its own Supabase Auth wiring (unused in
  practice — the app's actual login called a Postgres RPC directly, not
  Supabase Auth), and all data/files on a hosted Supabase project. Every RLS
  policy in its 28 migrations was `USING (true)`/`WITH CHECK (true)` — enabled
  but enforcing nothing; the (public, bundle-embedded) anon key alone could
  read/write/delete any row.
- **Why this app uses minted-JWT/RLS and not the native `/session/verify-permission`
  gate**: see §7's "Choosing an enforcement model" — short version, this is
  untrusted third-party code needing row-level enforcement, so the check lives
  below the app in Postgres RLS rather than in a call the app must remember to make.
- **Architecture — self-host the Supabase-shaped API, not a rewrite**:
  `@supabase/supabase-js`'s Postgres client is a REST client against
  **PostgREST**; its Storage client is a client against Supabase's own
  **`storage-api`** — both independently self-hostable. So the app's ~31
  feature components needed no rewrite, only reconfiguration:
  - `assets-db` — a dedicated Postgres, sibling to `db` (which backs
    Keycloak), not a shared schema — every third-party app gets its own.
  - `postgrest-assets` — PostgREST in front of `assets-db`, verifying a
    bearer JWT itself (`PGRST_JWT_SECRET`, shared with auth-gateway) and
    exposing its claims to Postgres as `request.jwt.claims`.
  - `storage-assets` — `supabase/storage-api`, file-system backend (a Docker
    volume, not S3), so `supabase.storage.from(...)` calls in the app work
    unmodified.
  - `services/auth-gateway/src/routes/dataToken.ts` — `GET /auth/data-token`
    mints a short-lived JWT from the caller's existing `app_permissions` row
    (the same read/write/edit/delete model every app already uses), signed
    with `PGRST_JWT_SECRET`. PostgREST/storage-api can't participate in
    Nginx's cookie-based `auth_request` — they need the actual permission
    claims to enforce RLS, not a yes/no — so this is the one place a session
    gets translated into a token an external process verifies on its own.
  - `apps/assets/supabase/migrations/20260707000000_centralhub_rls.sql` —
    rewrites every `USING (true)` policy into a real check against the
    minted JWT's claims. Applied by a one-shot `assets-migrate` service
    (`apps/assets/scripts/migrate.sh`) after `storage-assets` has bootstrapped
    its own `storage` schema — the exported migrations' `storage.*`
    statements are stripped from the earlier pass for exactly that ordering
    reason, and re-created here instead. Idempotent: safe to rerun against
    an already-migrated volume (e.g. a container restart).
  - Runtime shape: converted from TanStack Start (SSR, Cloudflare Workers
    target) to a static Vite SPA behind Nginx — matching every other app's
    Dockerfile exactly. Justified by the RLS finding above: there was no
    privileged server-side logic worth preserving, and the app's one SSR
    route added nothing beyond proxying an already-public storage object.
  - Design system: kept its own Tailwind v4/shadcn/React 19 stack internally
    — `packages/ui`'s peer range was later widened to
    `^18.3.1 || ^19.0.0` (see §9), so the conflict that originally
    justified this is gone, but a full `AppShell` adoption still isn't
    worth doing: this app's chrome (nav layout, Tailwind v4 CSS-first
    theme) is structurally different enough that only genuinely identical
    pieces are shared. `AssetsNav`
    (`apps/assets/src/components/AssetsNav.tsx`) imports
    `packages/ui/src/tokens.css` directly (plain CSS custom properties,
    framework-agnostic) for its own hand-authored layout, plus the real
    `ThemeToggle` component (see §9's note on the `@source`/color-alias
    plumbing that made importing it actually render correctly) — not a
    hand-rolled duplicate.
  - Registry: wired in via the existing static lists (`apps.ts`,
    `KNOWN_APPS`, `docker-compose.yml`) — a Postgres-backed dynamic registry
    remains a deferred, separate future phase (see §13), not a prerequisite
    for onboarding one real app.
  - `vite.config.ts` sets `base: "/apps/assets/"`, same as every other app —
    easy to miss (the default is `/`) since a missing `base` still builds
    and serves fine locally; it only breaks once proxied under a path
    prefix, as a blank page (bundle 404s silently).
- **Storage-schema visibility, found via live browser testing**:
  `storage-api` does a per-request Postgres role switch
  (`SELECT set_config('role', '<role>', true)`, the same mechanism
  PostgREST uses) to enforce its own checks — a role switch does **not**
  carry schema visibility with it. Without `GRANT USAGE ON SCHEMA storage`
  for the switched-to role, every `storage.*` query fails with a misleading
  "relation does not exist" (not "permission denied"), since the parser
  can't resolve an invisible object. Two separate role sets needed the
  grant: `storage-api`'s own bootstrap roles (`anon`/`authenticated`/
  `service_role`) **and** the role real end-user requests actually carry
  (`assets_authenticated`, from `/auth/data-token`) — missing either one
  breaks a different operation (bucket metadata vs. object upload). Both are
  in `20260707000000_centralhub_rls.sql`; root-caused by enabling Postgres
  statement logging and watching a live 500 in real time.
- **UX**: `apps/assets`'s own "Log out" button (inside `RoleSwitcher`) was
  removed — it only cleared the app's local role-picker state (see below),
  not the CentralHub session, and having two different-behaving logout
  buttons was confusing. Logout is CentralHub's job (via `AssetsNav` /
  central-hub), not something a third-party app duplicates. PDFs now open
  inline in a new tab (browser's native viewer) instead of forcing a
  download — the original export's `download` attribute was a deliberate
  choice there, but nothing server-side requires it (`storage-assets` sets
  no forcing `Content-Disposition`).
- **Identity → `role_code` mapping**: `apps/assets`'s own role-picker login
  (independent of CentralHub identity) is now optional, not mandatory.
  auth-gateway owns two new, generic (not assets-specific) Postgres tables:
  `user_attributes` (`user_sub → department/position/job_level`, required
  once set, managed from `apps/admin`'s Users panel — see "Managed
  attribute values" below) and `app_role_rules`
  (`app_id, role_code, department?, position?, job_level?` — a `NULL`
  criteria column is a wildcard). `GET /auth/data-token` resolves the
  caller's attributes against that app's rules
  (`services/auth-gateway/src/attributes.ts`'s `resolveRoleCode`, most-
  specific-match-wins) and returns a `role_code` alongside the token if one
  matches. `apps/assets` manages its own rules from a new admin panel
  (`RoleRulesPanel.tsx` — `role_code` is this app's own vocabulary, kept out
  of the generic `apps/admin`) and auto-logs a matching user straight into
  the resolved role on load, skipping the picker entirely. A user with no
  attributes set, or none of the app's rules matching, still sees the
  picker exactly as before — nothing is mandatory. Verified end-to-end:
  `dev-admin` (Executive/Manager/Senior) auto-resolves to `ADM01` via a
  position-only wildcard rule; `dev-user` (Purchasing/Staff/Junior)
  auto-resolves to `REQ01` via a separate wildcard rule matching any
  department, mirroring the design's own goal (a role open to every
  department still auto-grants correctly). `dev-admin`/`dev-user`'s
  attributes and both rules are seeded automatically on boot
  (`attributes.ts`'s `seedDevAttributes()`, same retry pattern as
  `seedDevPermissions()`) — a fresh `docker compose up` demonstrates this
  working without replaying the manual `curl` commands used while building
  it.
- **Found via live browser testing**: the auto-login effect originally
  skipped resolution entirely whenever `apps/assets`'s own `localStorage`
  already had a role picked — meaning a stale manual pick from an earlier,
  unrelated Keycloak session on the same browser silently overrode the
  correct auto-resolved role for whoever was *currently* logged in (since
  that `localStorage` state isn't tied to Keycloak identity at all). Fixed
  by always resolving on mount and overwriting `localStorage` whenever a
  role_code matches — only falling back to whatever's already there when
  nothing resolves.
- **Managed attribute values** (closes the "free text, no enum" gap):
  department/position/job_level were plain required text fields — a typo
  (e.g. "Purchasing" vs "purchasing") silently broke an `app_role_rules`
  match with no error. A new generic `attribute_values` table
  (`kind, value`, seeded with a handful of obvious demo values per kind —
  see `db.ts`'s `migrate()`) backs a managed vocabulary per column instead.
  `apps/admin`'s Users panel now renders each column as a dropdown
  (`AttributeSelect.tsx`, built on a new `Select` primitive added to
  `packages/ui` — the first shared dropdown in the repo, styled with a
  custom chevron via `appearance-none` so it doesn't fall back to each
  browser's own native arrow) sourced from
  `GET /auth/admin/attribute-values/:kind`, with a "+ Add new..." option
  that opens a small Radix Dialog modal (mirrors `packages/ui`'s
  `ConfirmDialog` pattern) with an input and a Save button, and calls
  `POST /auth/admin/attribute-values/:kind` (`routes/adminAttributeValues.ts`)
  on confirm to extend the list in place — no separate values-management
  screen needed. Existing free-text values not in the seed list (there are none
  today, since the seed list includes exactly what `seedDevAttributes()`
  assigns dev-admin/dev-user) still display correctly as an extra
  "(unlisted)" option rather than being silently dropped.
- **Full CRUD, and the same list reused everywhere a CentralHub department/
  position/job level gets typed** (closes the rest of the "official list"
  gap — the paragraph above only covered Create/Read):
  - `PUT`/`DELETE /admin/attribute-values/:kind/:value`
    (`routes/adminAttributeValues.ts`, `renameAttributeValue()`/
    `deleteAttributeValue()` in `attributes.ts`). Rename is transactional and
    cascades to every existing `user_attributes` and `app_role_rules` row
    referencing the old value, so a correction (fixing a typo, updating
    outdated terminology) never leaves a reference pointing at a name that's
    no longer in the list. Delete is blocked (`409`, with the blocking
    counts in the response body) while any `user_attributes` or
    `app_role_rules` row still references the value — unlike a value simply
    missing from the seed list, an *admin-initiated* delete of something
    genuinely in use would be a silent, confusing loss with no recovery
    path, so this one case is enforced server-side rather than left to
    "(unlisted)" display fallback. `apps/admin`'s Users panel gained a
    "Manage" link on each of the three column headers
    (`AttributeValueManagerDialog.tsx`) — inline rename and delete per
    value, surfacing the `409` blocking reason directly.
  - `POST /admin/apps/:appId/role-rules` (`adminRoleRules.ts`) now validates
    any non-null `department`/`position`/`jobLevel` criterion against this
    same list before creating a rule, closing the exact "silent typo never
    matches any real user" failure mode this section already fixed for
    `user_attributes` — `resolveRoleCode()` does an exact string compare, so
    an unlisted value in a rule was previously accepted and simply never
    matched anyone. Not retroactive: rows written before this validation
    existed aren't re-checked.
  - `apps/assets` and `apps/engineering`'s own "Role Rules" admin panels
    (`RoleRulesPanel.tsx`) — previously free-text `<Input>`s for
    department/position/job level when defining an `app_role_rules` row —
    are now `Select`s sourced from the same `GET
    /auth/admin/attribute-values/:kind` list (a blank/"any" choice is a
    sentinel value translated to `null`, preserving the existing wildcard
    meaning). `apps/engineering`'s `DeptAliasSection` (CentralHub department
    → this app's own `departments.id`) also converted its CentralHub-side
    picker the same way — the alias *target* (this app's own department
    row) is unaffected, only the CentralHub-side value is now constrained
    to the managed list.
- **Verified**: a request with no token gets `401`; a valid session with
  `read: false` gets `[]` (RLS filters every row); `read: true` returns real
  seeded data; `write: false` attempting an `INSERT` gets `403` even though
  authenticated — the `USING (true)` gap is closed, not just moved. Full
  login → `/auth/data-token` → gateway-proxied `postgrest-assets` chain
  verified end-to-end against a real Keycloak session, plus a full live
  browser pass: login, role-picker login, submitting a request, uploading
  and viewing a PDF, and RBAC-boundary checks (`dev-user` vs `dev-admin`).
- **Status**: done. `storage-assets`'s bucket-metadata admin endpoint (not
  used by the app itself, which only uploads/downloads objects) still needs
  the service key rather than a per-user JWT — tracked in §13. The
  `cc_recipient` dropdown (multi-select "สำเนาถึง"/CC field) was missing
  seed data — a gap in the original export, since only its single-select
  `recipient` counterpart ("เรียน"/To) had rows — now seeded with the same
  person/department pool in `20260707000000_centralhub_rls.sql`. Department/
  position/job level, previously plain free-text fields, are now managed
  dropdowns with admin-addable values — see "Managed attribute values"
  above.
- **Note for a future reader**: the paragraphs above are a historical record
  of what this ingestion actually did — including applying Lovable's 32
  exported migrations as a literal file-per-change history, plus the
  `apps/assets/supabase/migrations/20260707000000_centralhub_rls.sql`
  rewrite layered on top — matching this repo's own convention of leaving
  ingestion write-ups as-written, warts included. **That is no longer what's
  on disk.** A later pass (per §10c's guiding principle, once §13's "predates
  the rewrite-over-patch guideline" items were revisited) replaced all 33
  files with 3 clean, idempotent files at
  `apps/assets/db/migrations/` (`20260707000000_schema.sql`,
  `20260707000001_rls.sql`, `20260707000002_storage.sql`), mirroring
  `apps/engineering/db/migrations/` exactly — same end-state schema/RLS/seed
  data, verified column-for-column against the original 33 files, just no
  longer expressed as incremental history. `apps/assets/scripts/migrate.sh`
  no longer needs the `grep -v` storage-statement filter or the
  `ALREADY_MIGRATED` guard as a result — see §13 (rows for both were removed
  once fixed).

---

---
