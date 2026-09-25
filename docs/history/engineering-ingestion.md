# History: apps/engineering ingestion and hardening

The second ingestion, its update run, and the hardening pass that followed.

> Part of the [CentralHub documentation](../../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

---

## 10b. Second third-party app ingestion (`apps/engineering`)

- **Objective**: same as §10 — onboard an externally-built app onto our own
  infrastructure, no ongoing SaaS dependency — for an export that arrived
  meaningfully harder than `apps/assets`.
- **What came in**: `apps/engineering` ("BigOne"/`bgone`) is a Thai-language
  machine repair-job workflow — a reporter (ผู้แจ้ง) files a repair job on a
  machine, a leader (หัวหน้าสังกัด) assigns a repairer (ผู้ซ่อม), who works it
  through statuses (`in_progress → waiting_parts → external → awaiting_review`)
  to `completed`; plus parts requisitions, a job-history log, and a
  `repair-images` storage bucket. TanStack Start (SSR) on React 19/Tailwind v4,
  **real Supabase Auth** (code → synthetic `@bigone.local` email/derived
  password, `supabase.auth.signInWithPassword`), and — unlike `apps/assets`,
  where every RLS policy was `USING (true)` — **real RLS**: every policy keyed
  on `auth.uid()`/`has_role()`/`current_dept()`, reading this app's own
  `user_roles`/`profiles`. Also had server functions with real logic: admin
  user CRUD, single-session-per-user enforcement (heartbeat + force-logout),
  and a Google Sheets sync via `connector-gateway.lovable.dev` (an external
  Lovable SaaS dependency, not just hosted Supabase).
- **What was dropped, and why**:
  - **Google Sheets sync** — dropped entirely (not re-homed to a direct
    Google API either). Kept it would mean retaining exactly the kind of
    ongoing third-party SaaS dependency this ingestion pattern exists to
    remove. Tracked in §13.
  - **Single-session enforcement** (`active_session_id`/heartbeat) —
    retired; CentralHub's own instant session revocation (§8) already
    solves the same problem app-wide, so a second, app-local mechanism
    would be redundant. Its columns (`profiles.active_session_id`/
    `active_session_seen_at`) don't exist in this app's schema at all —
    see below on why the schema was rewritten fresh rather than patched.
  - **The app's own admin user CRUD / code-based login** — CentralHub is the
    only login (same principle as every other app); a user's engineering
    profile is now provisioned automatically (see below), not created by an
    admin inside the app.
- **Architecture — same minted-JWT/RLS recipe as `apps/assets`, but the
  migrations are written fresh, not patched**: because the exported RLS
  already keyed on `auth.uid()`/`has_role()`/`current_dept()` (not
  `USING (true)`), redirecting those three functions to resolve identity
  from the JWT `GET /auth/data-token` mints (instead of a Supabase Auth
  session) covers almost all of the real authorization logic. The first
  pass kept the 14 exported migration files byte-identical and applied them
  through a filtering/ordering layer (stripping `storage.*`/Realtime
  statements line-by-line, a bootstrap shim for ordering) — but between
  dropping Supabase Auth, the role/department model, and the dead
  single-session/Sheets-sync columns, that "preserve the export" principle
  (which earns its keep for `apps/assets`, where the change is purely
  additive RLS narrowing) was mostly adding a second layer of workarounds
  on top of a schema this ingestion was already substantially rewriting.
  So `apps/engineering/db/migrations/` (named `db/`, not `supabase/` — this
  app talks to self-hosted PostgREST/storage-api now, not a Supabase CLI
  project) is three clean files reflecting the end state directly, no
  exported-migration patching:
  - `20260716000000_schema.sql` — enums, tables (with the dead columns
    genuinely dropped, not left inert), indexes, and every function
    (`auth.uid()`, `has_role()`, `is_engineering_user()`, `current_dept()`,
    `ensure_profile()`, `gen_job_code()`, `touch_updated_at()`) + triggers.
  - `20260716000001_rls.sql` — `engineering_anon`/`engineering_authenticated`
    roles, RLS policies (same logic the export had, now reading the JWT),
    and the `EXECUTE` grants those policies need (a real bug caught live:
    the export's own migrations `REVOKE EXECUTE ... FROM PUBLIC, anon` on
    `has_role()`/`current_dept()` as hardening, so the new
    `engineering_authenticated` role needs an explicit grant or every query
    fails closed with "permission denied for function has_role").
  - `20260716000002_storage.sql` — the `repair-images` bucket + policies,
    applied only after `storage-engineering` bootstraps its own schema.
  - Every statement across all three is idempotent (`IF NOT EXISTS`/
    `OR REPLACE`/`DROP POLICY IF EXISTS`+`CREATE`/`ON CONFLICT`), so
    `scripts/migrate.sh` just re-applies all three on every container
    start — no "already migrated" guard, no line-filtering, no ordering
    shim required, unlike the first pass.
  - `engineering-db` / `postgrest-engineering` / `storage-engineering` /
    `engineering-migrate` in `docker-compose.yml`, mirroring the `assets-*`
    services' shape (own dedicated Postgres, same storage-schema-visibility
    grants) without mirroring assets' apply-the-export-as-is mechanics.
  - Converted from TanStack Start (SSR, Cloudflare Workers target) to a
    static Vite SPA behind Nginx, same as `apps/assets` and for the same
    reason: no privileged server-side logic worth preserving once
    Supabase Auth/single-session/Sheets-sync are gone.
  - The original export's `supabase/config.toml` (a Supabase-CLI project-id
    pointer to the hosted project) was deleted outright, and the directory
    itself renamed `supabase/` → `db/` — nothing in this app talks to that
    hosted project or the `supabase` CLI anymore, so keeping either the
    file or the old directory name would mislead a future reader into
    thinking they still do something here.
- **Vocabulary — "department" means two different things here, and the
  distinction was only made explicit in the 2026-09-15 update pass (§10d)
  after live use showed the reporter form displaying the wrong one**:
  - **Department (แผนก)** — where an employee actually works: CentralHub's
    `user_attributes.department` ("Quality Control", "Purchasing"…).
    Platform-owned; reaches this app only as the minted JWT's `dept_name`
    claim, never stored in a table here. Shown to the user as their แผนก.
  - **Repair group (สังกัดช่าง)** — an engineering sub-group that takes
    repair jobs: ช่างผลิต / ช่างบรรจุ / ช่างทั่วไป. This is what this app's
    `departments` table actually holds (the upstream table name is kept so
    future Lovable exports still 3-way-merge), and what every
    `department_id` FK here points at — `profiles`, `repair_jobs`,
    `parts_requisitions`, `machines.repair_department_id`,
    `machine_types.department_id`. `current_dept()` returns a repair group.
  - **Routing** — `department_aliases` (bulk: "this department's jobs go
    to this repair group") and `department_user_overrides` (per user) map
    the first onto the second; `profiles.department_id` caches the result.
    "Quality Control → ช่างผลิต" means the ช่างผลิต crew is responsible
    for QC's machines — not that a QC employee is "in" ช่างผลิต.
  - The UI now uses แผนก strictly for the first and สังกัด/สังกัดช่าง for
    the second (the export already said "หัวหน้าสังกัด"/"สังกัดผู้ซ่อม" for
    the group; ingestion-era labels that said "แผนกในระบบนี้" were
    corrected). In code, `useAuth`'s `Profile` carries `department` (the
    real one, display only) and `department_id`/`repair_group_name`. The
    same block lives at the top of `db/migrations/20260716000000_schema.sql`.
- **Role & department mapping — deliberately still zero changes to
  CentralHub's own `user_attributes` shape or admin UI**:
  - **General case**: this app's own admin panel (`RoleRulesPanel.tsx`,
    reachable only as its "admin" role's own tab) manages `app_role_rules`
    for `engineering` exactly like `apps/assets` does — e.g.
    `(department: *, position: Staff, job_level: Junior) → repairer` grants
    every Staff/Junior user, in any department, the `repairer` role.
  - **Exception case**: a new, fully generic `app_role_overrides`
    (`app_id, user_sub, role_code`) table in auth-gateway lets an admin pin
    one named CentralHub user straight to a role, bypassing the rules —
    checked first by `resolveRoleCode()` (override → rule → none). Not
    engineering-specific; any future app using the rules pattern gets this
    for free.
  - **Self-lockout guard**: because an override always wins over the
    rules, an admin overriding their *own* account to a non-admin
    role_code has no recovery path — the very tab that could undo it
    requires the admin role_code the override just took away (found live:
    testing "set dev-admin to หัวหน้าแผนก via an exception rule" locked
    dev-admin out of the engineering admin panel entirely). Blocked the
    same way §8 blocks self-revocation for the identical reason — not by
    building a recovery mechanism: `POST /admin/apps/:appId/role-overrides`
    (`adminRoleOverrides.ts`) rejects `userSub === ` the caller's own sub
    with a 400, and `RoleRulesPanel.tsx`'s user picker excludes the
    logged-in admin from the list so the mistake is hard to make in the
    first place.
  - **CentralHub admin is an absolute floor, not just a self-lockout
    guard**: the self-lockout fix above only prevented an admin from
    overriding *themselves* — a different admin could still be locked out
    by someone else's override, or by a rule mismatch. `resolveRoleCode()`
    (`services/auth-gateway/src/attributes.ts`) now checks a
    `CENTRALHUB_ADMIN_ROLE_CODE` map *first*, ahead of even an explicit
    override: any CentralHub Keycloak admin resolves to that app's admin
    role_code unconditionally, for any app listed in the map. **Opt-in**,
    keyed by the app's own admin role_code string — not every app's
    vocabulary uses the literal word "admin", so this only applies to apps
    that list themselves, hand-maintained the same way `KNOWN_APPS` is:
    `{ engineering: "admin", assets: "ADM01" }` — every app that actually
    resolves a role_code via this attributes/rules system at all (both of
    them; `apps/marketing`/`apps/finance` use the native read/write/edit/
    delete gate directly with no role_code concept, and `apps/admin`'s own
    access is Keycloak's admin realm role checked directly by Nginx, so
    neither has anything to list here). `assets: "ADM01"` reflects that
    app's own seed-data convention (whichever `role_assignments` row has
    `is_admin = true`, `ADM01` by convention, not a hardcoded meaning of the
    string) — update it if that seed ever changes. A direct consequence:
    for an opted-in app, an override targeting a CentralHub admin (self or
    otherwise) would now silently never take effect, so `POST /admin/apps/
    :appId/role-overrides` also rejects that write outright with a clear
    "would never take effect" error, rather than let an admin believe a
    dead override worked.
  - **Superseded — the guarantee is now unconditional and claim-borne**
    (`apps/{assets,engineering}/db/migrations/20260924000000_platform_admin.sql`,
    `services/auth-gateway/src/attributes.ts`'s `isAppAdmin()`): routing the
    guarantee through the app's own admin role_code made it **opt-in**, and
    that turned out to be the wrong default three ways — an app with no
    `admin_role_code` set (every app but these two, including every future
    one) gave a CentralHub admin no admin rights at all; the dev bootstrap
    that seeds the field fires exactly once, when a manifest sync first
    creates the app row; and clearing the field in `apps/admin`'s Apps tab
    silently and permanently removed the guarantee. The platform half no
    longer depends on that field: `GET /auth/data-token` mints an explicit
    `is_admin` claim (and `GET /session/context` the matching `isAdmin`
    field, for native-gate services via `@centralhub/service-kit`) that is
    true for **any** Keycloak realm admin regardless of app configuration,
    or for a normal user promoted to the app's own admin role_code. Apps
    deliberately cannot tell the two apart — there is one local notion of
    "admin here", and a platform admin always satisfies it, so no app needs
    a platform-vs-local branch. Nothing is written anywhere as a side
    effect: admin-ness is re-derived per request, so losing the realm role
    in Keycloak takes effect on the next mint with no stale local grant to
    clean up. `admin_role_code` keeps only its remaining job — naming which
    local code means "admin here", which is what makes the *promotion* half
    (role rules/overrides) expressible at all; an app that never needs a
    non-Keycloak admin can leave it unset.
    - `apps/engineering`'s `has_role()` ORs the claim into its `'admin'`
      branch only — a platform admin must not also read as
      `repairer`/`leader`/`reporter`, or every role-specific policy would
      treat them as all roles at once. `is_engineering_user()` ORs it in
      too, so a platform admin for whom no role_code resolves still counts
      as a user of the app.
    - `apps/assets` gets the `centralhub_is_admin()` helper but **no policy
      change yet**: its RLS checks only the four `perm` verbs and has no
      admin-aware policy to hook into, because its admin notion lives
      entirely in the frontend (`role_assignments.is_admin`, cached in
      `localStorage`, with a password picker fallback). Consequence, still
      open: any user holding `edit` on `assets` can `PATCH
      role_assignments` straight through PostgREST and self-promote. Fixing
      it means gating that app's admin-only tables on
      `centralhub_is_admin()` and dropping the client-side picker —
      behaviour-changing for existing users, so it needs role overrides in
      place first.
    - Also still open: each app's *frontend* continues to route on
      `role_code`, not on the new claim, so admin UI still appears only for
      apps whose `admin_role_code` is set. The RLS/API layer no longer
      depends on it; the UI layer does.
  - **Delegation: a local admin administers their own app, and only it**
    (`requireAppAdmin()` in
    `services/auth-gateway/src/middleware/requireAdmin.ts`): the guarantee
    above makes someone an admin *of* an app; this is what lets them
    actually administer it. `requireAdmin` answers "are you a platform
    admin", which is right for genuinely platform-wide surfaces but wrong
    for an app's own role panel — gating that on the realm role left a
    promoted local admin able to *be* an admin while unable to change
    anything, which is exactly how it failed in live testing: rules
    invisible and uncreatable, empty department/position pickers, and
    overrides rendering subject ids instead of names (the user list 403s, so
    the panel had nothing to resolve names against). Only the department
    matching worked, because that data lives in engineering's own DB behind
    RLS rather than behind an auth-gateway route.
    - **Delegated** (a local admin of `<app>` passes, as does any platform
      admin): `/admin/apps/:appId/role-rules`,
      `/admin/apps/:appId/role-overrides`, `.../resolve-role/:userSub` —
      app id from the path — plus the shared *reads* those panels need,
      with `?app=<id>` naming the app they are acting for:
      `/admin/users`, `/admin/users/attributes`,
      `/admin/users/:userSub/attributes`, `/admin/attribute-values/:kind`.
    - **Still platform-only**: the apps registry (`/admin/apps`, where
      `admin_role_code` itself is set — a local admin who could edit that
      could redefine what "admin here" means), the permission matrix, the
      audit log, session revocation, attribute-value **writes** (the
      vocabulary is shared, and a rename cascades into every other app's
      rules), and `PUT /admin/users/:userSub/attributes` (a user's
      department/position is CentralHub-wide identity data).
    - **Scoped, not just gated**: on the shared reads the middleware sets
      `req.adminScope`, and the handler narrows by it — a local admin's
      user list and attribute map contain only users holding at least one
      verb on their own app (`listUserSubsWithAppAccess()`). This is both a
      privacy boundary (an engineering admin has no business enumerating
      the company) and the semantically correct candidate set: an override
      for a user with no `read` is inert, because `GET /data-token` refuses
      that caller before any role code is consulted. The practical
      consequence is a clean split of duties — a platform admin decides
      **who may reach an app at all**, that app's own admin decides **what
      role they hold inside it**.
    - **`apps/assets` now mirrors `apps/engineering`'s panel**: it had a
      rules section but no overrides section at all, so ADM01 — which a
      rule cannot grant — had no UI path whatsoever and could only be
      assigned by calling the API directly. Added `OverridesSection`
      against the same generic endpoints, with the one deliberate
      asymmetry the guardrail requires: the *rules* role picker filters out
      every `is_admin` role_code, the *overrides* picker keeps them (and
      flags them 🔑), because granting admin per user is exactly what it
      is for. To exclude the caller from its own user picker the way
      engineering does with `profile.id`, `GET /auth/data-token` now also
      returns the caller's own `sub` unpacked in the response body, so an
      app need not decode the JWT to answer "which row is me?". Both
      panels now surface auth-gateway's `{ error }` message on a refused
      write instead of a bare status code — without it every guard in this
      section reads as an unexplained "400".
    - **Two assets UI fixes found in live testing**: the app shell was
      capped at `max-w-4xl` where `apps/engineering` uses
      `max-w-7xl mx-auto px-4 sm:px-6`, which left most of a laptop screen
      as margin — all three containers in `apps/assets/src/App.tsx` now
      match engineering's shell, and `AssetPurchaseForm`'s *own* nested
      `max-w-4xl` was removed so step 1 fills the tab like every other
      panel instead of visibly jumping width when you switch tabs. And in
      the new overrides section the user and role-code pickers sat on
      different lines: the hint text lived inside the user cell, making
      that column taller, so `items-end` lifted its Select above the other.
      The hint now sits below the grid as a full-width line.
    - **No self-lockout, both directions**: `POST` already refused an
      override on your own account; `DELETE` now refuses one too when the
      row belongs to the caller and they are a local rather than platform
      admin. Found in live testing — a local admin could delete the very
      override that made them one and lose access, with no way back through
      the panel they had just locked themselves out of. Scoped to local
      admins on purpose: a platform admin's status comes from the realm
      role, so deleting their own row costs them nothing, and blocking it
      would strand a legacy row nobody could clear. Deleting *someone
      else's* override stays allowed — that is ordinary administration, and
      recoverable.
    - **The floor**: `POST .../role-overrides` refuses any target holding
      the Keycloak realm role, so a local admin cannot demote a platform
      admin. That check was previously conditional on the app having an
      `admin_role_code`, which silently left it absent for apps without
      one; it is now unconditional, and paired with the self-override
      block and the override-only rule below it means the only way to
      create an admin is a named, audited, single-subject grant.
  - **Admin is override-only — never grantable by attribute rule**
    (`AdminRoleRuleForbiddenError` in
    `services/auth-gateway/src/attributes.ts`): the companion guardrail to
    the promotion half above. A rule is a *bulk* grant over whoever
    currently matches a department/position/job-level combination, and that
    set drifts on its own as HR data changes — `position = Manager ->
    admin` silently promotes every future Manager. Worse, it routes around
    the existing self-override guard (`adminRoleOverrides.ts` refuses to let
    an admin retarget their own account), since a rule that happens to match
    yourself achieves the same thing. Restricting admin to overrides makes
    every admin grant explicit, named, single-subject and audited.
    - Enforced in three places, deliberately: `createAppRoleRule()` rejects
      the write (surfaced as 400, not 403 — no caller, however privileged,
      can express this, so it is not a permission failure);
      `resolveRoleCode()` *also* skips any rule whose role code is the app's
      admin code, so a row predating the restriction cannot keep granting;
      and both role-rule panels drop the admin role from their rule picker
      while keeping it in the overrides picker.
    - This binds platform admins too, not only local ones — the reason is
      about the grant's shape, not the granter's rank. A platform admin who
      wants several people promoted still can, one named override at a time.
    - The two dev seeds that created exactly this shape (`assets` ADM01 and
      `engineering` admin, both `position = Manager`) are removed. Nothing
      is lost: they only ever matched `dev-admin`, who is a Keycloak realm
      admin and so resolves to the app's admin code through
      `resolveRoleCode()`'s platform branch regardless of any rule. On an
      existing volume those rows survive but are inert; auth-gateway logs a
      one-line cleanup prompt naming them at startup
      (`warnOnAdminGrantingRules()`), and they can be deleted from the app's
      own role-rules panel.
  - **Department resolution is entirely engineering-owned, zero new
    auth-gateway tables**: auth-gateway already reads `user_attributes` to
    match rules, so it just also passes the caller's raw `department`
    string through as a `dept_name` JWT claim (no new table, no new admin
    route). This app's own `department_aliases` table (inside
    engineering-db, managed via a plain PostgREST call from the same admin
    panel) maps that string to this app's own `departments.id`;
    `current_dept()` resolves through it live, every request.
  - `profiles.department_id` is a cache, refreshed by `ensure_profile()`
    on every login from the same `department_aliases` lookup — not
    authoritative on its own (`current_dept()` is), but relied on directly
    by `parts_requisitions`'s own RLS policy and by the UI.
  - **Found via live use, fixed in a later pass**: the bulk `dept_name` →
    `department_aliases` chain was the *only* department-resolution path,
    with no per-user escape hatch — if a user's CentralHub `department`
    attribute had no matching alias row (unset, mistyped, or genuinely had
    no equivalent in engineering's own 3-value vocabulary, ช่างผลิต/
    ช่างบรรจุ/ช่างทั่วไป), `current_dept()` silently returned `NULL`,
    `profiles.department_id` cached that `NULL`, and `LeaderPage.tsx`'s
    `if (!profile?.department_id) return;` left every list empty — no
    error, just a blank-looking หัวหน้าสังกัด (leader) landing page, with
    no way to tell which of the two independently-configured tables
    (auth-gateway's role rule/override vs. engineering's own alias) was
    the actual gap. Fixed by adding a **per-user department override**,
    `department_user_overrides` (`user_sub UUID UNIQUE, department_id`,
    `apps/engineering/db/migrations/20260717000000_dept_user_overrides.sql`),
    checked first in `current_dept()` before the alias fallback — the
    direct-assignment analog to `department_aliases`, mirroring the shape
    role resolution already has (bulk `app_role_rules` + per-user
    `app_role_overrides`). Deliberately kept as its own general,
    role-independent chain rather than folded into the per-user *role*
    override: `profiles.department_id` is relied on by every role, not
    just leader (`ReporterPage.tsx` filters visible machine types and
    defaults a new job's department from it; `RepairerPage.tsx` defaults a
    completed job's parts-requisition department from it;
    `department_head`'s dormant `parts_requisitions` RLS policy is
    department-scoped too) — bulk/ordinary users still need the generic
    alias path to keep working. Managed from a new `DeptOverridesSection`
    in `RoleRulesPanel.tsx`, and surfaced by a new `DiagnosticsSection` in
    the same panel (admin picks a user, sees the resolved role_code,
    `dept_name` claim, which mechanism supplied the department, and an
    explicit warning if a department-scoped role resolved with no
    department) — so this failure mode is visible directly instead of
    only as a blank page. `LeaderPage.tsx` itself now also renders an
    explicit "your department hasn't been set" message instead of
    silently returning early.
  - **A second, unrelated bug found while fixing the above**:
    `LeaderPage.tsx`'s repairer roster query
    (`supabase.from("user_roles").select(...)`) targeted a table that
    doesn't exist post-ingestion — role became purely JWT-resolved (see
    `has_role()`'s own comment in `20260716000000_schema.sql`: "there is
    no user_roles table"), so this silently returned nothing and the
    "assign to repairer" dropdown was always empty regardless of
    department resolution. Since role isn't stored anywhere to query in
    bulk, fixed with a small new auth-gateway route,
    `GET /auth/apps/:appId/role-codes?subs=a,b,c`
    (`services/auth-gateway/src/routes/roleLookup.ts`), gated by
    `requireSession` only (not `requireAdmin` — a leader who isn't a
    CentralHub realm admin still needs this), fanning out to the existing
    `resolveRoleCode()` per requested user. `LeaderPage.tsx` now calls this
    for its own department's candidate profiles instead of the dead table.
- **Identity provisioning**: a new `ensure_profile()` `SECURITY DEFINER`
  Postgres RPC, called once per page load from `useAuth.tsx`, upserts the
  caller's own `profiles` row (keyed to `auth.uid()`, so a user can only
  touch their own row) and refreshes its cached `department_id`. Replaces
  the app's own retired admin-user-creation flow entirely.
- **Post-ingestion polish, found via live use after the initial pass**:
  - **Full name instead of a raw code**: `ensure_profile()` originally had
    no real display name (only a `sub`-derived short code), so every user
    showed up as e.g. `a1b2c3d4` in the UI. Fixed by adding a `name` claim
    to the minted JWT (`dataToken.ts`, sourced from the existing CentralHub
    session — nothing new to look up) and having `ensure_profile()` read
    and refresh it every call. (The short code itself survived as
    `profiles.code` until §10g replaced it with the Keycloak username via
    a `username` claim on the same JWT.)
  - **Nav inconsistency**: `AppHeader.tsx` originally put the "← Central
    Hub" link on the right; every other app's chrome (`packages/ui`'s
    `AppShell`, `AssetsNav.tsx`) puts it leftmost. Restructured to match.
  - **Users tab upgraded** into a live-session/attribute view: two
    sub-tabs ("online now" — a 5-minute `last_seen_at` window, pulsing dot;
    "login history" — everyone, sorted by recency) showing full CentralHub
    attributes as badges, plus a locally-computed engineering role_code
    badge per user. `profiles.last_seen_at`, refreshed by a 3-minute
    client-side heartbeat (`useAuth.tsx`) in addition to `ensure_profile()`'s
    normal per-load call. The role badge deliberately computes
    `resolveLocalRole()` client-side from data the admin panel already
    fetches (existing `role-rules`/`role-overrides` endpoints) rather than
    adding a new backend route — accepted simplification, since this is a
    display-only convenience for the admin, not an authorization decision;
    it also doesn't replicate the `CENTRALHUB_ADMIN_ROLE_CODE` guarantee
    check (see below), so it can show a stale/absent badge for a user whose
    *actual* role_code comes from that guarantee rather than a rule/override
    — cosmetic only, `resolveRoleCode()` server-side is unaffected.
  - **Dark mode did nothing**: `styles.css` declared `@custom-variant dark
    (&:is(.dark *))` (so the toggle button worked — it did add/remove the
    `.dark` class) but never defined a `.dark { ... }` block overriding any
    of the color variables, so every variable kept resolving to its `:root`
    (light) value regardless of the class. Separately, `body`'s background
    was a hardcoded light-mode `linear-gradient(...)` literal instead of
    referencing the theme variables, which would have kept fighting a
    correct `.dark` block anyway. Fixed both: added a `.dark` block (a
    dark-adapted version of this app's own green/brand palette, not a copy
    of `apps/assets`' blue-gray one — each app's `.dark` block should stay
    in its own hue family), and switched the body background to
    `var(--color-background)`/`var(--color-muted)`.
  - **Post-cleanup pass**: a stray duplicated `apps/engineering/apps/engineering/`
    directory (byte-identical copy of `vite.config.ts`/`index.html`) was
    left over from an earlier file-write tooling quirk mid-ingestion —
    deleted. `bun.lock` (this repo is a single pnpm workspace, `bun` was
    never actually used to install anything here) was deleted. `.gitignore`
    and `eslint.config.js` still had dead entries for the TanStack Start/
    Cloudflare Workers scaffolding this app dropped in step 1 of the
    original ingestion (`.output`, `.vinxi`, `.tanstack/**`, `.nitro`,
    `.wrangler/`, `.dev.vars`, and an ESLint `no-restricted-imports` rule
    about `@tanstack/react-start/server-only`) — trimmed, since none of it
    can ever fire again. See §10c's new final-cleanup step for the general
    version of this checklist.
- **Known limitations, not built out further this pass** (see §13):
  - **Realtime job-alert popups/sounds** (`useJobAlerts.ts`) call
    `supabase.channel(...).on("postgres_changes", ...)` — Supabase
    Realtime is its own server component, not part of the
    PostgREST/storage-api pair this ingestion stood up, so these
    subscriptions currently have nothing to connect to. Left in place
    (harmless — fails to connect, doesn't crash the page) rather than
    ripped out, since standing up self-hosted Realtime is a real
    infrastructure addition of its own, out of scope for this pass.
  - `AppRole`'s `department_head` value has no dedicated page in the
    original export either (only admin/leader/repairer/reporter do) — the
    app shows a "no screen for this role yet" message rather than one being
    invented here.
  - `allowed_repair_dept_ids` (a reporter's restricted machine-repair-dept
    picker) was admin-editable-per-user in the original export; dropped
    along with the rest of per-user admin editing rather than rebuilt as a
    rule, since nothing in the app actually read/enforced it even before
    this ingestion.

---

---

## 10g. Post-update hardening (`apps/engineering`, 2026-09-15/16)

Everything the live-test pass after the §10d update changed **beyond** what
Lovable shipped. None of it came from the upstream diff; all of it was
pre-existing ingestion-era behaviour that only became visible by walking
the old screens while testing the new feature. Kept apart from §10d so
that section remains the playbook and this is the changelog.

**Coverage of the upstream update, for the record** (19 files):

| Upstream change | Outcome |
|---|---|
| Migration: 5 scheduling columns + `expire_pending_schedules()` | Merged — `EXECUTE` granted to `engineering_authenticated` only, not `anon` |
| Reporter: schedule mode/date picker, `SetRepairDateDialog`, resubmit-after-cancel | Merged, live-tested |
| Leader: assign blocked while awaiting schedule, machine code/description on cards, monthly per-repairer summary | Merged, live-tested |
| Repairer: parts-ready toggle, re-edit while awaiting review, part-row completeness check, monthly status pie | Merged, live-tested |
| `JobStatusChips`, `JobDetailDialog` scheduling rows, `JobFilters` multi-select status | Merged |
| `PartsRequisitionTab`: leader's manual entry form and row delete removed | Merged as-is (accepted) |
| Admin: machine-type search, edit dialogs for types/machines | Merged, live-tested |
| History: spreadsheet table, one row per part | Merged, live-tested (+ container widened, see below) |
| `types.ts` regeneration | Replaced wholesale (ingestion had never regenerated it) |
| `useAuth` `onAuthStateChange` tweak | Ignored — no Supabase Auth events exist here; the loading flash it fixed can't occur |
| `previewAuthStorage.ts`, `client.ts` | Ignored — Lovable preview-iframe auth brokering |
| `sheets.functions.ts`, `public-history.functions.ts` | Ignored as files (retired at ingestion); the latter's new fields ported into `HistoryPage`'s PostgREST query |
| `@lovable.dev/vite-tanstack-config` bump | Ignored — TanStack Start was dropped at ingestion |

**Fixes and additions from the live-test pass** (migrations
`20260915000001`–`04`, all idempotent, all applied to the existing volume):

- The read-only แผนก field had been blank since ingestion: `useAuth` read
  a `department_name` off `ensure_profile()`'s return value that never
  existed (the export got it from a `profiles → departments` join the RPC
  replaced). Fixing it exposed the deeper issue: the value it *would* have
  shown was the repair group, not the employee's department — see the
  vocabulary block in §10b. The form now shows both, labelled แผนก (from
  the `dept_name` claim) and สังกัดช่างที่รับผิดชอบ, and every label
  across the app that called a repair group "แผนก" was corrected.
- The reporter-name default vanished after each submit (upstream bug too:
  the seeding effect only fires when `full_name` changes; `resetForm()`
  blanked it). Now resets to `profile.full_name`.
- "รหัสผู้ใช้งาน" showed the sub-derived 8-hex short code — meaningless
  to a user. auth-gateway now carries Keycloak's `preferred_username`
  through the session (`oidc.ts` → `callback.ts` → `session.ts`,
  optional on tokens minted before the deploy) into a `username` claim
  on the minted JWT (`dataToken.ts`); `20260915000001_profile_username.sql`
  redefines `ensure_profile()` to store it as `profiles.code`,
  refreshed every login, falling back to the short code only for a
  pre-deploy session. Labelled ผู้ใช้งาน now. When the hosted data is
  eventually imported (§13), the real employee codes from `profiles.csv`
  are a candidate for this column instead — decide then.
- **Leader's assign dropdown missed a repairer whose group an admin had
  just changed** — a real pre-existing bug, surfaced because the test
  cast was set up via overrides. `profiles.department_id` (the cached
  repair group) is refreshed only by `ensure_profile()`, i.e. only when
  *that user* loads a page; `LeaderPage`'s roster filters *other* users'
  cached values, so an admin moving a repairer into a leader's group had
  no visible effect until the repairer next logged in — and the
  diagnostics panel looked fine, because `current_dept()` reads the
  override live. (`test-stack.mjs` had been leaving exactly this stale
  state behind on every run: it flips dev-user's override, triggers
  `ensure_profile()`, restores the override, never re-triggers.)
  Fixed at the source: `20260915000002_group_override_sync.sql` adds an
  AFTER INSERT/UPDATE trigger on `department_user_overrides` that writes
  the cache directly (an override is authoritative, so the cached value
  is exactly known). DELETE is deliberately not handled — the fallback
  resolution needs the user's own `dept_name` claim, unknowable from the
  admin's request; the cache self-heals on that user's next load. The
  test now asserts the restore write re-synced the cache.
- **Leader actions gated by status.** Ingestion had added reassign and
  revert-to-pending on the leader's active list without considering
  `awaiting_review`: reverting a finished job left a `pending_assign` row
  carrying stale close-out data and requisitions pointing at the old
  repairer. Now: in_progress / waiting_parts / external → reassign (all
  state travels with the job; only `assigned_to` is repairer-specific
  before close-out) or revert (also clears `parts_ready`); awaiting_review
  → neither, only a new **leader reject** (same `in_progress` +
  `reject_reason` transition the reporter's reject makes, audited as
  `job.leader_reject`), after which the other two unlock.
- **`RejectJobDialog`** (`components/RejectJobDialog.tsx`) replaces the
  export's raw `window.prompt()` on both reject paths — a required reason
  (the prompt accepted ""), a description of what will happen, themeable.
- **Rejection history kept.** `repair_jobs.reject_reason` is a single
  column, so a second rejection overwrote the first. Each rejection now
  also appends to `job_history` — the table the export defined and never
  wrote to — with a new `kind = 'reject'` discriminator
  (`20260915000003_job_history_kind.sql`, `lib/jobHistory.ts`); the detail
  dialog shows "ประวัติการปฏิเสธงาน (N ครั้ง)" newest-first with actor and
  time. `reject_reason` stays as "latest" and drives a new red
  **ถูกปฏิเสธ** chip in `JobStatusChips` (shown while the job is back in
  in_progress / waiting_parts / external), so a repairer sees it in the
  list without opening details.
- **Audit log redesigned** (`components/AuditLogPanel.tsx`, extracted from
  `AdminPage`): a real table (date/time · colour-coded action pill · job
  code · human-sentence detail · actor) instead of cards with raw JSON;
  filters for text, action, actor and date range; tab renamed
  บันทึกการดำเนินการ. On naming, since the app now has four "histories":
  the **History page** is a spreadsheet of jobs; the leader's **ประวัติ**
  tab is their group's jobs; **ประวัติการปฏิเสธงาน** inside a job's detail
  is that job's rejections; the admin tab is the **audit log** (who did
  what).
- **History page widened** to full viewport width — it inherited the
  export's `max-w-5xl` (1024px) container while the new table needs
  1200px, so it always scrolled horizontally regardless of screen size.
- **Test cast seeded in code**, so a fresh stack has one account per role
  routed to one repair group without hand-configuring the admin panel:
  auth-gateway's `seedDevAttributes()` sets dev-user4 (Finance/Staff/
  Senior) and dev-user5 (Operations/Staff/Mid) attributes if unset and
  adds `reporter`/`leader` overrides for them if the app has none;
  `20260915000004_dev_seed_aliases.sql` seeds the department → repair
  group routing (Purchasing/Finance/Operations → ช่างผลิต, Executive →
  ช่างทั่วไป) if the alias table is empty. Both guards mean an admin's
  later edits are never resurrected by a restart. The resulting cast:
  **dev-user4** reporter, **dev-user5** leader, **dev-user** repairer
  (Staff/Junior rule), **dev-admin** admin — reporter files on an Oven
  machine, leader assigns to Dev User. Verified in a rolled-back
  transaction against the live DB; not yet against a fresh volume (§13).
- **Photos preprocessed client-side before upload** (`src/lib/imageUpload.ts`,
  called from the three upload sites: `ReporterPage`, `RepairerPage`,
  `ReporterEditJobDialog`). Engineering uploaded raw camera files — the
  hosted history (§13 item 5) shows what that produces: median 370 KB but
  p90 3.9 MB, max 9.6 MB, plus HEICs no Chromium/Firefox `<img>` can
  render. Now the same policy `apps/assets` already had (canvas re-encode
  to JPEG, ≤1600px, quality/width stepped down to ~350 KB), copied per-app
  per §3, with two changes applied to **both** copies: HEIC/HEIF is
  decoded in-browser via `heic-to` (libheif WASM, dynamically imported so
  the ~730 KB gz chunk only loads when someone actually picks a HEIC —
  iPhone users just upload) instead of being refused, and an image that
  can't be compressed under target is uploaded at its smallest encode
  instead of throwing — a big photo is better evidence than no photo.
  The legacy photos were normalized to the same policy offline
  (`db/import/normalize-images.mjs`) so old and new rows share one
  format/size profile.

---

---
