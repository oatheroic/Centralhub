# History: session handoffs

Newest first. Superseded handoffs are kept for the reasoning they record, not as current instructions.

> Part of the [CentralHub documentation](../../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

---

## 17. Session handoff notes

For whoever (human or agent) picks this repo up next — what changed most
recently, and where to look first.

**What just happened (2026-09-25)**: made the CentralHub platform admin a
real, universal thing across every third-party app, and made *local* app
admins a delegable role rather than a decorative one. Before this, "a
Keycloak realm admin is an admin everywhere" was only true by accident: it
was expressed through `apps.admin_role_code`, a per-app field populated by a
dev-only bootstrap that fired once at app creation, absent for three of five
apps, and silently erasable from the Apps tab. Now `isAppAdmin()`
(`services/auth-gateway/src/attributes.ts`) is the single definition, minted
as an `is_admin` claim by `GET /auth/data-token` and as `isAdmin` on
`GET /session/context`, true for any realm admin regardless of app config,
or for a user promoted to that app's own admin role code. Apps deliberately
cannot tell the two apart. Nothing is written anywhere — admin-ness is
re-derived per request, so losing the realm role in Keycloak leaves no stale
local grant behind.

Three further pieces, each found by live testing rather than reasoning:

- **Delegation** (`requireAppAdmin()`,
  `services/auth-gateway/src/middleware/requireAdmin.ts`). A promoted local
  admin could *be* an admin but not administer anything: every
  `/auth/admin/...` route still demanded the realm role, so their app's role
  panel showed no rules, empty pickers, and subject ids instead of names.
  The per-app routes plus the shared reads those panels need now accept a
  local admin of the named app (`?app=<id>`), while the apps registry,
  permission matrix, audit log, session revocation and all attribute-value
  *writes* stay platform-only. On the shared reads the response is also
  **narrowed**: a local admin sees only users holding a verb on their own
  app. That is both a privacy boundary and the semantically correct
  candidate set, and it splits the duties cleanly — a platform admin decides
  who may reach an app at all, its own admin decides what role they hold
  inside it.
- **Admin is override-only.** An attribute rule can no longer grant an app's
  admin role code: a rule is a bulk grant over whoever currently matches a
  department/position/job-level combination, so `position = Manager ->
  admin` would promote every future Manager, and it routed around the
  self-override guard. Enforced at write time, *and* skipped at resolve time
  so pre-existing rows cannot keep granting, *and* removed from both apps'
  rule pickers. The two dev seeds that created exactly this shape are gone.
- **No self-lockout, both directions.** A local admin could delete the very
  override that made them one and lose the panel that could restore it.
  Refused now, for local admins only — a platform admin's status comes from
  the realm role, so their own row costs them nothing.

`apps/assets` was brought to parity with `apps/engineering`: it had a rules
section but **no overrides section at all**, so ADM01 — which a rule cannot
grant — had no UI path whatsoever. Added, with the one deliberate asymmetry
the guardrail needs (rules picker hides admin codes, overrides picker keeps
them). Both panels now surface auth-gateway's `{ error }` message instead of
a bare status code, without which every guard above reads as an unexplained
"400".

**Deliberately not done**: `apps/assets`'s RLS still checks only the four
`perm` verbs, so its admin gate remains client-side and a user with `edit`
can still self-promote by writing `role_assignments` through PostgREST. The
`centralhub_is_admin()` helper is installed and unused, waiting for that
fix; it is behaviour-changing for existing users and wants role overrides in
place first. See the deferred catalog.

**Verification**: `scripts/test-stack.mjs` 159/159 throughout; `pnpm
test:unit` 19/19. Targeted live runs against the real stack — 30/30 for the
guarantee, 24/24 for delegation, 16/16 for the assets panel, 12/12 for
self-lockout, 6/6 proving the user-list narrowing actually filters (6 -> 5
-> 6 as one user's app access was revoked and restored). Both app databases
were exercised directly at the SQL level, including the fail-closed cases
(claim absent, no claims at all). One finding left unfixed and recorded:
`apps/assets`'s pre-existing `centralhub_perm()` throws on an empty
`request.jwt.claims` string because it lacks the `NULLIF` guard its
engineering counterparts have; it fails closed and PostgREST does not
produce that state in practice.

**Files touched**: `services/auth-gateway/src/` — `attributes.ts`
(`isAppAdmin`, `AdminRoleRuleForbiddenError`, `warnOnAdminGrantingRules`,
resolve-time skip, seed removal), `middleware/requireAdmin.ts`
(`requireAppAdmin`, `adminScope`), `permissions.ts`
(`listUserSubsWithAppAccess`), `routes/{dataToken,session,adminUsers,
adminAttributes,adminAttributeValues,adminRoleRules,adminRoleOverrides}.ts`,
`index.ts`; `packages/service-kit/src/{auth,index}.ts` + tests;
new `apps/{assets,engineering}/db/migrations/20260924000000_platform_admin.sql`
with both `scripts/migrate.sh` runners updated; `apps/engineering/src/`
(`components/RoleRulesPanel.tsx`, `pages/AdminPage.tsx`);
`apps/assets/src/` (`components/RoleRulesPanel.tsx` — new overrides
section, `App.tsx` + `components/AssetPurchaseForm.tsx` — width fixes,
`integrations/supabase/client.ts` — `getCurrentUserSub`).

**Documentation was restructured this session.** The README had reached 3,332
lines and was doing five jobs at once. It is now 157 lines of orientation
plus `docs/`, split by what you are trying to do: reference
(`architecture`, `auth-and-rbac`, `ui`, `app-registry`, `notifications`,
`testing`, `deferred`), `playbooks/` for procedures, `history/` for the
record. The binding constraint was that **41 source files cite `§N` section
numbers in comments**, so nothing was renumbered — the numbers are now
documented as stable IDs and the README maps each to its file. 24 of 25
sections were verified byte-identical after the move; the exception is this
file, which gained this entry. Three stale references were fixed, the one
that mattered being a playbook step still instructing readers to add new apps
to `KNOWN_APPS`, replaced by manifest registration several sessions earlier.
Added `CLAUDE.md` (agent working context, including the environment gotchas
that cost time here) and
[docs/playbooks/maintaining-docs.md](../playbooks/maintaining-docs.md), which
is the procedure for keeping all of this from rotting — read it before
editing docs.

**A cold-start audit followed the restructure**, asking what a brand-new agent
would still be missing. Five real gaps, all now closed: no **glossary**
(`docs/glossary.md`) — "admin" meant four different things in this repo and
"role" four more, which is exactly the confusion this session's feature work
was about; no consolidated **data model** or **service map** (both now in
`docs/architecture.md`); "how to add a new app" was a bold list item buried in
§3 rather than a findable heading, so an agent asked to add one would reach
the *third-party ingestion* playbook by mistake — it is now
`### How to add a new app` and linked from the README index; the
enforcement-model decision tree, which is the first architectural choice for
any new app, was an unlinked `###` inside a 351-line file; and the **`.env`
lifecycle** (gitignored, deleted per session, with a dev-period exception
currently in force) was documented *only inside a superseded handoff*, which
by this repo's own rule is not instructions — now in the README Quickstart and
CLAUDE.md. Three more stale `KNOWN_APPS`/`§13` references were fixed in the
same pass.

**Where to go next**: (a) close the assets RLS hole above, now that
overrides exist to carry the admins across; (b) each app's *frontend* still
routes its admin UI on `role_code` rather than the new claim, so an app with
no `admin_role_code` would grant database access while showing no admin
screen — invisible today, real for the first app that needs it; (c) the
`marketing`/`finance`/`resource-booking` trio have no role vocabulary, so
they can have platform admins but no local ones, and nothing warns that
`admin_role_code` is unset.

---

**What just happened**: the first real exercise of §10d — a Lovable
re-export of `apps/engineering` (two months of upstream work: a repair
scheduling feature + UI polish) was merged into the already-ingested,
already-rewritten app **without** re-ingesting, and the hosted instance's
production data (420 jobs, 206 requisitions, 41 users, the full machine
catalog) arrived as CSVs alongside it and was **deliberately not
imported**. The code side went smoothly and taught the playbook one
technique: 3-way-merging each changed file against the archived baseline
(`git merge-file --diff3`) resolved 3 of 8 files with zero conflicts
(including the 900-line `AdminPage`) and left only trivial
"ingestion-deleted vs. Lovable-edited" conflicts elsewhere; only
`HistoryPage` needed real hand-work. New migration
`20260915000000_repair_scheduling.sql` (5 columns + 1 function, no new
RLS), applied to the existing volume with the pre-existing rows intact.
The data side is the important decision to understand: every
person-referencing column in the CSVs carries a hosted Supabase Auth uid
with no Keycloak counterpart yet, and the hosted `departments` table
conflates this app's repair sub-groups with company departments that
CentralHub's platform list is meant to own — so a partial import
(NULLed FKs + legacy-name columns) was designed, then rejected in favour
of waiting for a complete mapping. §13's engineering table now carries a
six-point prerequisite checklist for that one-shot import; the CSVs are
archived at `apps/engineering/archive/20260915-update/data/`.

**Verification**: `pnpm test:stack` **158/158** (was 148; 8 new
assertions borrow a `pending_assign` job, push it past a synthetic
deadline, call `rpc/expire_pending_schedules`, confirm `cancelled_at` is
set while `status` is untouched, and restore it). `tsc --noEmit` on
`apps/engineering` reports exactly the same pre-existing error set before
and after (all in `RoleRulesPanel`/`audit.ts`/`useAuth`, from the
app-local tables `types.ts` never described — untouched this session,
the Vite build doesn't typecheck). The rebuilt `app-engineering` image
confirmed to serve the new feature strings. Then a full live-browser
pass through every role (reporter → leader → repairer → admin → history)
with a seeded test cast, which produced §10g — seven pre-existing issues
fixed, four more migrations, and a redesigned audit log. Final
`pnpm test:stack` **159/159**.

**Files touched this session**: `apps/engineering/src/` — `pages/{Reporter,
Leader,Repairer,Admin,History}Page.tsx`, `components/{JobDetailDialog,
JobFilters,PartsRequisitionTab,RoleRulesPanel}.tsx`, new
`components/{JobStatusChips,SetRepairDateDialog}.tsx`, `hooks/useAuth.tsx`,
`lib/{auth-utils,pdf-export}.ts`, `integrations/supabase/types.ts`
(replaced with the new export's copy); new
`db/migrations/20260915000000_repair_scheduling.sql`,
`20260915000001_profile_username.sql` and
`20260915000002_group_override_sync.sql`, a vocabulary header on
`20260716000000_schema.sql`, `scripts/migrate.sh`; new
`archive/20260915-update/` (stripped export + `data/*.csv`) and
`archive/README.md`; `services/auth-gateway/src/{oidc,session}.ts`,
`routes/{callback,dataToken}.ts` (username claim), `attributes.ts` (test-cast
seed); later in the pass: new `components/{RejectJobDialog,AuditLogPanel}.tsx`,
`lib/jobHistory.ts`, migrations `20260915000003_job_history_kind.sql` and
`20260915000004_dev_seed_aliases.sql`; `scripts/test-stack.mjs`; this README
(§10b vocabulary, §10d playbook amendments + first-run notes, new §10g,
§11, §13, §17). No gateway, compose, or shared-package changes.

**Where to go next**: (a) the §13 engineering data-import prerequisites —
creating the 41 Keycloak users and producing the uid→sub mapping is the
gating work, and it's a people/admin task before it's a code task;
(b) a fresh-volume (`down -v`) check is now overdue — §10g's seeds were
only dry-run in a rolled-back transaction, and the live dev volume still
carries hand-made overrides for the test cast that a fresh stack gets
from aliases instead; (c) one oddity noticed in
passing: four `repair_jobs` rows titled "should be rejected (dev-user is
repairer, not reporter)" exist in the dev volume, dated 07-18 to 07-22 —
`test-stack.mjs`'s RLS INSERT test correctly gets 403 today, so these
were inserted while dev-user temporarily held a `reporter` override
during an earlier manual session; harmless dev-seed noise, delete via the
admin panel if it bothers anyone.

**Older handoff, preserved below for now**: a platform consolidation pass (§10f) rather than a
new app. Started from a "is the foundation ready for more mini-apps?"
review of the previous session's resource-booking work: it had exposed
that only the frontend half of the app factory was templated — the
backend was hand-built, every future backend would re-copy its auth/db
boilerplate, hand-write an Nginx block, and had no way to emit
notifications. Built `packages/service-kit` (auth middleware over a new
one-call `GET /session/context`, Pool/retry, **tracked migrations**,
`notify()`, health), `services/_template`, generic
`/apps/<id>/api/` → `api-<id>:4200` Nginx routing (per-app block deleted,
compose service renamed `api-resource-booking`), migrated booking-api onto
the kit as the reference consumer, and wired the first app-originated
notification (admin cancels your booking → you're told). Docker gotcha
solved along the way: a service depending on a `workspace:*` package
can't use the older `npm install` runtime stage — kit consumers use
`pnpm deploy`. Two real bugs surfaced by the tests and fixed: a latent
same-second revoke-vs-relogin race in `revocation.ts` (Phase 5 era), and
`test-stack.mjs` §6d's title-count deltas saturating at the 50-row list
cap. Live browser testing then found the admin-override cancel had never
had a UI (chips were display-only) — added a × on chips for own/
`delete`-permitted bookings.

**Verification**: `pnpm test:unit` 16/16 (first unit tests in the repo);
`pnpm test:stack` **148/148** (was 137), run twice back-to-back against
the persistent stack; `0001_init` confirmed recorded once in
`schema_migrations` on the existing `booking_pgdata` volume and a no-op
on every restart since; the deployed `api-resource-booking` image
confirmed to contain the kit's `dist`; browser: dev-admin cancels
dev-user's booking via the chip ×, dev-user's bell shows the warning
with a working link. **Not** re-verified against a fresh volume
(`down -v`) — still outstanding since several sessions.

**Files touched this session**: new `packages/service-kit/` and
`services/_template/`; `services/auth-gateway/src/routes/session.ts`
(`/session/context`), `services/auth-gateway/src/revocation.ts` (bug fix);
`services/booking-api/` (Dockerfile, package.json, `src/{auth,config,db,index}.ts`
collapsed onto the kit, new `src/migrations.ts`, `src/routes/*.ts`);
`apps/resource-booking/src/{lib/api.ts,components/BookingBoard.tsx}`;
`gateway/conf.d/default.conf`; `environments/docker-compose.yml`; root
`package.json` (`test:unit`, `dev:booking-api`); `pnpm-lock.yaml`;
`scripts/test-stack.mjs`; this README. One new dev dependency (`vitest`,
in `packages/service-kit`).

**Where to go next**: the foundation is now genuinely ready for more
mini-apps — the next backend-bearing app should take the
`services/_template` checklist at face value and report anything it still
had to hand-edit. Remaining platform items are in §13 (admin responsive
redesign, fresh-volume check, unit tests for auth-gateway's own authz
helpers).

---

**Older handoff, preserved below for now**: built `apps/resource-booking` + `services/booking-api`
(§10e) — a room-booking app, and the first app in this repo with a real
mutating backend, closing a gap every earlier section only ever described
(§7's native gate had no caller; §13 tracked "real mutating backend per app"
as not started). Came out of an open-ended ideation conversation (explored
several general-productivity mini-app ideas — a people directory/org chart
was the other finalist, deliberately scoped down and left as a separate
plan file for a future session rather than built here) before narrowing to
this one and a concrete implementation plan. Architecture: `booking-db`
(own dedicated Postgres, no PostgREST/storage-api layer — this is trusted
first-party code, not a third-party export, so it uses the native
`/session/verify-permission` gate instead of minted-JWT/RLS), `booking-api`
(plain Express, mirrors `auth-gateway`'s `Pool`/`connectWithRetry`/`migrate()`
pattern), a `bookings` table with a Postgres `EXCLUDE USING gist` constraint
making double-booking impossible at the DB layer (not just checked in
application code), and a day-view frontend. Followed up with a manual
live-testing pass (not just the automated suite) that surfaced two real
bugs: (1) a hardcoded `09:00–10:00` form default silently created
already-past bookings when tested later in the day, invisible in "upcoming"
with no explanation — fixed with a next-upcoming-hour default plus
past-time rejection on both the client and server; (2) a UI/UX pass adding
confirm dialogs (cancel booking, delete room — previously no confirmation
on either), capacity/location badges, live room status ("Free now"/"In
use"), booking chips, and date navigation. See §10e for the full writeup,
including a deployment gotcha worth reading before touching `gateway/` or
`auth-gateway/` again: both bake their config/code into the Docker image at
build time, so editing `gateway/conf.d/default.conf` or
`services/auth-gateway/src/permissions.ts` does nothing on a running stack
until those specific images are rebuilt and recreated — this produced a
confusing false signal (404s and 403s that looked like application bugs)
while first verifying this feature.

**Verification**: `scripts/test-stack.mjs` extended with an 11-assertion
"10b" section (native-gate permission boundary for both verbs, the
double-booking 409, self-cancel-vs-admin-override) — 137/137 passing
against the live stack. Also verified by hand: real Keycloak logins as
both dev users, a real 409 on an overlapping booking, a real 400 on a
past-time booking, dev-user confirmed unable to reach room management or
cancel dev-admin's booking but always able to cancel their own.

**Files touched this session**: new `apps/resource-booking/` (full app,
scaffolded from `apps/_template`) and `services/booking-api/` (full
service); `environments/docker-compose.yml` (three new services:
`booking-db`, `booking-api`, `app-resource-booking`), `environments/.env.example`
(`BOOKING_DB_PASSWORD`), `gateway/conf.d/default.conf` (new
`/apps/resource-booking/api/` location), `services/auth-gateway/src/permissions.ts`
(two new `seedRow()` demo-permission calls), `scripts/test-stack.mjs`, this
README. One new dependency (`lucide-react`, in `apps/resource-booking`,
matching the precedent already set by `apps/admin`).

---

**Older handoff, preserved below for now**: built the platform notification system described in
§16 — a real backend (`notifications` table, four session-gated read
endpoints, an admin announcement endpoint) and a real frontend
(`NotificationBell` in `packages/ui`, wired into all five real header
locations) replacing the old single-hardcoded-banner "notifications." Started
from an execution plan a collaborator drafted without repo access; verified
its architecture against the actual code first (six grounding corrections —
wrong React-19/`packages/ui` peer-conflict premise that would've produced an
unneeded hand-authored engineering "twin," `apps/assets` missing from the
rollout entirely, producers that should call the notification helper
in-process instead of self-issuing HTTP, a partial-unique-index `ON
CONFLICT` bug in the dedupe logic, producer call sites moved to sit beside
the existing `recordAudit()` calls rather than inside the DB-layer
functions, and confirming Nginx needs zero edits by actually reading
`gateway/conf.d/default.conf` rather than assuming) before writing any code
— see §16 for what shipped. Verified end-to-end against the real stack, not
just typecheck-clean: real Keycloak logins, real permission grants/session
revokes/announcements fired through the actual admin endpoints, Playwright
screenshots of the bell rendering and opening correctly in all five
locations (installed fresh — no chromium-cli/Playwright available in this
environment beforehand), and `scripts/test-stack.mjs` extended with 24 new
assertions, run twice consecutively with no stack restart to confirm the
delta-based assertions are actually idempotent (126/126 both times) rather
than passing once by accident. One live-browser-only bug found and fixed
along the way that no amount of code review would have caught: engineering's
header used a 3-child `justify-between` flex, which stranded the bell in the
middle instead of hugging the theme toggle.

**Files touched this session**: `services/auth-gateway/src/{db,notifications}.ts`,
`services/auth-gateway/src/routes/{notifications,adminAnnouncements}.ts`,
`services/auth-gateway/src/routes/{adminPermissions,adminSessions}.ts` (producer
wiring), `services/auth-gateway/src/{audit,index}.ts`,
`packages/ui/src/{notifications.ts,components/NotificationBell.tsx,components/Badge.tsx,components/AppShell.tsx,index.ts,package.json}`,
`apps/central-hub/src/App.tsx`, `apps/assets/src/{components/AssetsNav.tsx,styles.css}`,
`apps/engineering/src/{components/AppHeader.tsx,styles.css}`,
`apps/admin/src/{App.tsx,components/AnnouncementsPanel.tsx}`,
`scripts/test-stack.mjs`, this README. One new dependency
(`@radix-ui/react-popover`, in `packages/ui`).

---

**Older handoff, preserved below for now**: picked up one of the two items
explicitly deferred in an earlier session — the "Add app" form's Department
field was a free-text `Input`, letting an admin type any string instead of
picking from the managed `attribute_values` vocabulary. Replaced it with
`AttributeSelect` (`apps/admin/src/components/AppFormDialog.tsx`), the same
managed-dropdown component `UsersPanel` already uses for department/position/
job-level; wired `AppsPanel.tsx` to fetch
`GET /auth/admin/attribute-values/department` on mount and post new values
through the same endpoint's `POST` — no backend change needed, both already
existed and were already in use elsewhere in this app. Verified against the
live stack (real Keycloak login as `dev-admin`, headless-Chrome CDP):
create-mode dropdown lists the real seeded departments (`Engineering`,
`Executive`, `Finance`, `Marketing`, `Operations`, `Purchasing`,
`Quality Control`) plus "+ Add new...", and edit-mode correctly pre-selects
the row's existing department (checked against the `finance` app →
`Finance`). The other deferred item, `apps/admin`'s full responsive/
multi-device redesign, is still not started — see §13.

Before that, two pieces of follow-up work off a UX handoff spec
for `central-hub`'s landing dashboard. First, a full responsive/multi-device
redesign of that dashboard plus own-department pinning — see §9's new
`central-hub responsive/multi-device redesign` status bullet for the full
writeup (sticky search/filter, mobile search collapse, scroll-snap tabs/
recency row, `--dept-*` color tokens, safe-area insets, coarse-pointer
target bumps, `GET /auth/me` now also returning `department`/`position`/
`jobLevel`). Verified against the live stack: real Keycloak login, headless-
Chrome screenshots (no chromium-cli/Playwright available in this
environment, so drove Chrome directly over the DevTools protocol via
Node's built-in `WebSocket`, cookie-injecting a real session) across
desktop/tablet/phone, plus a temporary `user_attributes.department`
reassignment (reverted after) to actually exercise the pinning path rather
than trust it from reading the code. One correction made mid-implementation
worth flagging: the handoff spec's department color-token names assumed
app-id-shaped department strings (`assets`, `admin`); the real `apps` table
uses capitalized display names (`Marketing`, `Finance`, `Engineering`,
`Operations`, `Platform`) — fixed before it shipped, not after.

Second, flipped the shared default theme from dark to light
(`packages/ui/src/theme.ts`'s `getStoredTheme()` fallback) — one-line, one-
file change, picked up by every app automatically via the shared
`chub_theme` localStorage key; no flash-of-wrong-theme risk since every
app already calls `applyTheme(getStoredTheme())` before first paint (or,
for `apps/engineering`, `ThemeToggle`'s own mount-time initializer — see
§9). Verified live with a fresh browser profile (no stored preference).

**Explicitly deferred, not done this session** (see §13's General table for
both): extending this same responsive redesign to `apps/admin` (four
`DataTable`-heavy panels — Permissions, Users, Apps, Audit — a materially
bigger job than central-hub's card-grid rework, since `DataTable` has no
mobile/card fallback today); and swapping the "Add app" form's free-text
Department `Input` (`apps/admin/src/components/AppFormDialog.tsx`) for a
dropdown of the managed `attribute_values` vocabulary, reusing
`AttributeSelect.tsx` the same way `UsersPanel` already does. Both are
scoped and ready to pick up, just not started.

**Files touched this session**: `apps/central-hub/src/App.tsx`,
`src/components/AppCard.tsx`/`IdentityBanner.tsx`/`SystemBanner.tsx`,
`src/lib/auth.ts`, new `src/lib/deptColor.ts`, `index.html`;
`packages/ui/src/components/Avatar.tsx`/`ThemeToggle.tsx`, `src/theme.ts`,
`src/tokens.css`, `tailwind-preset.cjs`;
`services/auth-gateway/src/routes/session.ts`; this README. No database
migrations.

---

**Older handoff, preserved below for now** — fixed the React-version-driven UI fragmentation
between first-party apps and the two third-party ingestions
(`apps/assets`, `apps/engineering`) — see §9's `ThemeToggle` note and
§10/§10b's design-system bullets (now updated) for the full writeup.
Summary: `packages/ui`'s peer range was pinned to React `^18.3.1`, which is
why both third-party apps (React 19) hand-authored their own duplicate
theme-toggle button instead of importing the shared `ThemeToggle`
component. Widened the range to `^18.3.1 || ^19.0.0` in
`packages/ui/package.json` (verified via `npm view` that the two Radix
packages it depends on already support React 19) and `pnpm install`'d —
this also fixed `apps/engineering` having no importer entry in
`pnpm-lock.yaml` at all, a pre-existing staleness independent of this fix.

Importing the real `ThemeToggle` into `AssetsNav.tsx`/`AppHeader.tsx`
wasn't enough on its own, though — found by actually building and grepping
the compiled CSS, not just reasoning about it. Both apps' Tailwind v4 setup
uses `@import "tailwindcss" source(none)`, which means Tailwind *only*
scans paths an app explicitly lists via `@source` — `packages/ui`'s own
source directory was invisible to it, so `ThemeToggle`'s classes
(`text-text-muted`, `hover:bg-border`, etc.) silently compiled to nothing.
Fixed per-app with an `@source "../../../packages/ui/src"` line plus a
`--color-text`/`--color-text-muted` alias in each app's `@theme inline`
block (mapping to its existing `--foreground`/`--muted-foreground`
variables — `packages/ui`'s components use chub's own token names, which
don't exist natively in either app's shadcn-derived theme). Verified by
grepping the built CSS for the generated rules
(`.text-text-muted{color:var(--muted-foreground)}` etc.) before trusting
it, then confirmed live: rebuilt/restarted `app-assets`/`app-engineering`
against the running stack, logged in as `dev-admin` via a real Keycloak
flow (headless Chromium, no chromium-cli available in this environment so
drove it directly with Playwright), and screenshotted the toggle across
`central-hub`/`admin`/`assets`/`engineering` in both themes — pixel-
consistent icon, size, and hover color everywhere.

**A planned second half of this fix was deliberately dropped**: also
migrating `apps/engineering`'s local `ConfirmDialog.tsx` wrapper onto
`packages/ui`'s version. Blocked by a real token-naming collision, not a
mechanical peer-dep issue: `packages/ui`'s `Button` "primary" variant uses
`bg-accent`/`text-accent-fg`, and `apps/engineering`'s own shadcn
primitives already define `--color-accent`/`--color-accent-foreground`
natively for an unrelated purpose — a subtle hover-highlight color used by
its calendar, command palette, dropdown/context menus, and more. Aliasing
`--color-accent` to chub's bold brand color (the same trick that worked
for `--color-text`) would have repainted all of those existing hover
states. Left the local wrapper in place; confirmed via a live screenshot
(triggering `AdminPage.tsx`'s job-delete dialog, both themes) that it
still renders correctly, unaffected by the peer-range widen.

**Files touched this session**: `packages/ui/package.json`,
`pnpm-lock.yaml`, `apps/assets/src/components/AssetsNav.tsx`,
`apps/assets/src/styles.css`, `apps/engineering/src/components/AppHeader.tsx`,
`apps/engineering/src/styles.css`, this README. No database migrations, no
backend changes — purely a frontend build/styling fix. `apps/admin` was
built locally (not modified) to confirm the widened peer range doesn't
disturb React 18 apps.

**Older handoff, preserved below for now** — fixed a real regression
reported against `apps/engineering`'s หัวหน้าสังกัด (`leader`) role — after
ingestion, an admin could no longer directly assign a specific user to
lead a specific department the way the original (pre-ingestion) app
allowed, and even once the generic `dept_name` → `department_aliases`
mapping was configured, the leader's landing page stayed blank with no
error. See §10b's "Role & department mapping" subsection (now extended)
for the full root-cause writeup. Two bugs, both fixed:

1. **No per-user escape hatch in department resolution**: the bulk
   `dept_name` → `department_aliases` chain was the *only* path, with no
   direct-assignment fallback — a mismatch (unset/mistyped CentralHub
   attribute, or a value with no real equivalent in engineering's own
   3-value vocabulary) silently resolved `current_dept()` to `NULL`, which
   `LeaderPage.tsx`'s `if (!profile?.department_id) return;` turned into a
   blank page with no error anywhere. Fixed by adding
   `department_user_overrides` (per-user, checked before the alias
   fallback — `apps/engineering/db/migrations/20260717000000_dept_user_overrides.sql`),
   a new `DeptOverridesSection` in `RoleRulesPanel.tsx` to manage it, and a
   new `DiagnosticsSection` in the same panel showing an admin exactly what
   role_code + department a given user resolves to (and an explicit warning
   when a department-scoped role resolves with no department) — so this
   failure mode is visible directly instead of only as a blank page.
   Deliberately kept as its own general, role-independent chain (mirroring
   the existing bulk-rule + per-user-override shape role resolution already
   has) rather than folded into the role override, since
   `profiles.department_id` is relied on by every role, not just leader —
   see the README bullet for the reporter/repairer/department_head detail.
2. **A second, unrelated bug found while fixing the above**:
   `LeaderPage.tsx`'s repairer roster query targeted a `user_roles` table
   that doesn't exist post-ingestion (role is purely JWT-resolved) — the
   "assign to repairer" dropdown was always empty regardless of department
   resolution. Fixed with a new `GET /auth/apps/:appId/role-codes` batch
   lookup route (`services/auth-gateway/src/routes/roleLookup.ts`, gated by
   `requireSession` only, not `requireAdmin` — a leader who isn't a
   CentralHub realm admin still needs this), and a
   `GET /auth/admin/apps/:appId/resolve-role/:userSub` single-user
   diagnostic route reusing the existing `resolveRoleCode()`
   (`adminRoleRules.ts`, backs the new `DiagnosticsSection` above).

**Then, later in the same session**: while live-testing the leader fix
above across multiple roles/departments, five more real issues surfaced.
All fixed:

3. **Dev seed data silently fought an admin's own edits**: `seedDevAttributes()`
   inserted its two engineering demo rules (`admin`/Manager,
   `repairer`/Staff+Junior) unconditionally on every `auth-gateway` boot,
   guarded only by "does an identical row already exist" — so deleting or
   editing one of those two rows via `RoleRulesPanel` got silently
   resurrected on the very next container restart, undoing the admin's own
   change. This is exactly the kind of thing that happens constantly during
   iterative dev work (rebuilding/redeploying `auth-gateway` for unrelated
   fixes). Fixed with a new `seedRoleRulesIfEmpty()` helper (`attributes.ts`)
   that only seeds an app's demo rules while that app has *no* rules at all
   yet — once an admin has added anything (seeded or their own), it's never
   touched again. Applied to both `assets`'s and `engineering`'s demo rules.
   **Consequence worth knowing**: this also means the old implicit
   self-healing safety net is gone — previously, breaking a demo account's
   expected role resolution through live experimentation would fix itself
   on the next `auth-gateway` restart; now it won't, since that's the exact
   behavior this fix removes. (This surfaced immediately: dev-user's own
   generic Staff/Junior→repairer rule had been replaced by a more specific
   department-scoped one during live testing, so `scripts/test-stack.mjs`'s
   long-standing "dev-user resolves to repairer" assertion started failing
   post-fix — not a regression, just no more auto-repair. Restored the
   generic rule by hand and the suite is back to green; see §13's new
   multi-department row for the related root cause of why that rule got
   replaced in the first place. **Update, a later session**: restoring it
   by hand only fixed that one run — the same live-testing-driven drift
   (§12b's Warehouse test app, engineering's role rules) recurred, and
   would keep recurring indefinitely now that there's no auto-repair.
   `scripts/test-stack.mjs`'s own §9 now seeds this exact demo rule itself
   (idempotent POST, tolerates a 409 if already present) right before
   asserting on it, instead of asserting on whatever a prior live-testing
   session left behind — the fix belongs in the test's own setup, not in
   remembering to hand-restore DB state after every live-test pass.)
4. **Keycloak's own plumbing roles leaked into every role display**:
   `offline_access`, `uma_authorization`, and `default-roles-<realm>` are
   auto-granted to every Keycloak user and were flowing straight through
   into `user_roles`, `/auth/me`'s `roles` array (→ `IdentityBanner`'s
   badge), and `apps/admin`'s Users table — none of which this repo's own
   role checks ever query for (no refresh-token/UMA usage anywhere, see
   §6). Filtered at both of the two independent places they entered:
   `roles.ts`'s `syncRolesFromKeycloak()` (feeds `user_roles`) and
   `keycloakAdmin.ts`'s `listUsers()` (a separate direct-from-Keycloak
   fetch `GET /auth/admin/users` uses) — both now share one
   `isKeycloakPlumbingRole()` predicate rather than duplicating the
   exclusion list.
5. **Adding a duplicate role rule surfaced a raw Postgres error**:
   `createAppRoleRule()` had no conflict handling, so resubmitting a rule
   with identical (`role_code`, `department`, `position`, `job_level`)
   criteria threw `duplicate key value violates unique constraint
   "app_role_rules_unique_criteria"` straight into the admin's toast. Now
   throws a `RoleRuleExistsError`, caught in `adminRoleRules.ts` and
   returned as a clean `409`.
6. **A durable audit trail for `apps/engineering`'s own destructive
   actions, from scratch** — there wasn't one. `job_history` exists in the
   schema but nothing in the frontend has ever written to it (a dead table
   left over from the original export, like `user_roles` before it), and
   it couldn't have served as an audit log anyway (`job_id` is `ON DELETE
   CASCADE`, so it can never outlive the job it's about). Added a new,
   independent `audit_log` table
   (`apps/engineering/db/migrations/20260717000001_audit_log.sql` —
   append-only, denormalized `job_code`/no FK to `repair_jobs`, admin-only
   `SELECT` via RLS, insert-your-own-actor-id for everyone else, mirroring
   auth-gateway's own `audit_log` design rather than inventing a different
   shape) and a shared `logAudit()` helper
   (`apps/engineering/src/lib/audit.ts`). Wired into the specific actions
   that were flagged: admin job delete, and leader assign/reassign/
   revert-to-pending (below) — reporter/repairer's own routine status
   updates are intentionally not covered yet (scoped down per this
   session's own discussion; see §13's new row on this). A read-only
   "ประวัติการดำเนินการ" (Audit) tab was added to `AdminPage.tsx`
   (`AuditTab`, last 200 rows) so the log is actually visible somewhere,
   not just written. *(Since superseded — §10g: the tab became
   `AuditLogPanel.tsx` with a table and filters, and `job_history` is no
   longer dead: it now holds per-job rejection entries, which is a fit for
   its CASCADE semantics in a way an audit log never was.)*
7. **No confirm dialog on delete or on assign/reassign, and no way to
   undo an assignment**: `AdminPage.tsx`'s job delete used a raw browser
   `confirm()`; `LeaderPage.tsx`'s assign/reassign fired straight from a
   `<Select>`'s `onValueChange` with zero confirmation; and once a job was
   assigned, the only available action was reassigning to a *different*
   repairer — never back to unassigned. Added a small shared
   `ConfirmDialog` (`apps/engineering/src/components/ConfirmDialog.tsx`,
   built on this app's own `alert-dialog.tsx` primitives — deliberately
   still not `packages/ui`'s version even after §9 widened the React peer
   range: `packages/ui`'s `Button` "primary" variant uses `bg-accent`/
   `text-accent-fg`, and this app's own shadcn primitives already define
   `--color-accent`/`--color-accent-foreground` natively for a different
   purpose — a subtle hover-highlight color used by its calendar,
   command palette, dropdown/context menus, and more. Aliasing `--color-accent`
   to chub's bold brand color the way `AppHeader`'s `ThemeToggle` migration
   aliased `--color-text`/`--color-text-muted` would repaint all of those
   existing hover states; not a safe mechanical fix, so this wrapper stays)
   used for all four actions (delete, assign, reassign, and a
   new "ส่งกลับไม่มอบหมาย" revert-to-`pending_assign` action on
   `LeaderPage.tsx`, which clears `assigned_to`/`assigned_by`/`assigned_at`
   the same way they looked before `assign()` ever ran). All four now also
   write to the new `audit_log`.
8. **A vestigial internal code shown next to every person's name**: several
   places (`AppHeader.tsx`, `PartsRequisitionTab.tsx`, both of
   `LeaderPage.tsx`'s repairer dropdowns) displayed `profiles.code` (the
   first 8 chars of the person's auth UUID) as `"Full Name (a1b2c3d4)"` — a
   leftover from the original app's code-based login, made redundant once
   `full_name` became reliably populated from the CentralHub session
   (§10b's earlier "Full name instead of a raw code" polish already fixed
   the *missing*-name case but left this parenthetical in place). Removed
   from all four; left `machine.code` (a real asset tag, e.g. `"Press A
   (M-102)"`) untouched — different thing entirely, not vestigial. *(Since
   superseded — §10g made `profiles.code` the Keycloak username, so the
   `"Full Name (dev-user)"` form the 2026-09 upstream merge reintroduced in
   the leader's assign dropdown is now meaningful rather than vestigial.)*

Also created four more dev demo accounts, `dev-user2`..`dev-user5`
(`devuser2123`..`devuser5123`, same convention as `dev-user`), so testing
department-scoped roles (leader/repairer/reporter, each needing a distinct
department) doesn't have to reuse `dev-admin`/`dev-user` for every case.
Seeded into `keycloak/realm-export.json` (fresh-stack path) and
`permissions.ts`'s `seedDevPermissions()` (same grant shape as `dev-user`:
read+write on marketing/assets/engineering, nothing on finance) — also
created live in the already-running Keycloak realm + `app_permissions`
table for this session's stack, via its Admin REST API (the `realmRoles`
field in a runtime `POST /users` call is silently ignored by Keycloak,
unlike the static `--import-realm` file processing that already grants
`dev-admin`/`dev-user`'s roles correctly — had to assign the `user` realm
role in a separate `role-mappings/realm` call after creating each account).

**One incident worth flagging**: an early version of
`scripts/test-stack.mjs`'s `department_user_overrides` test used a plain
`POST` with no `?on_conflict=user_sub`, which collided with `dev-user`'s own
override (set via live admin testing) and — in a since-fixed cleanup bug —
its "restore what was there before" logic silently *deleted* dev-user's
real override instead, because a failed/empty read was treated as "nothing
was there to restore" rather than aborting. Caught immediately, restored via
direct SQL, and the test now throws instead of silently proceeding on any
read it can't confirm — never treat "couldn't confirm what's there" as "safe
to overwrite/delete" is now called out explicitly in that test's comments.

**Known-open items** — see §13's tables (now including two new rows from
this session: multi-department leadership isn't supported, and
parts-requisition delete still needs the same confirm-dialog/audit
treatment job delete just got).

**Verification approach this session**: extended `scripts/test-stack.mjs`'s
§9 `apps/engineering` block with new assertions — a `department_user_overrides`
round-trip (admin assigns dev-user directly to a seeded department, confirms
`ensure_profile()` picks it up, then restores whatever was there before,
not an unconditional delete), and the new `resolve-role`/`role-codes`
endpoints agreeing with `data-token`'s existing role_code resolution
(including that the batch lookup is reachable by a non-admin caller).
Rebuilt and redeployed `auth-gateway`, `app-engineering`, and
`engineering-migrate` multiple times across this session as each fix
landed; re-ran the idempotent `engineering-migrate` one-shot against the
already-running (not fresh-volume) `engineering-db` each time — every
migration file, including the two new ones this session
(`20260717000000_dept_user_overrides.sql`,
`20260717000001_audit_log.sql`), applied cleanly with the expected `NOTICE:
... already exists, skipping` lines on repeat runs. Full suite: 91/91
passing against the live stack as of this handoff. Not yet re-verified
against a genuinely fresh volume (`docker compose down -v` + up) — the
"temporary exception" below means that hasn't been exercised this session
either.

**Git/environment state as of this handoff**: all of the above is staged
for a commit alongside this README update (see the commit this paragraph
ships in). `environments/.env` is gitignored and deleted at the end of
each session per this repo's own convention (see §3/§5) — regenerate it
from `.env.example` following §14's Quickstart before bringing the stack
back up. The "temporary exception" noted below (volumes/`.env` left in
place across sessions) is still in effect as of this handoff.

**Temporary exception (dev period only)**: as of this handoff, `environments/.env`
and the stack's Docker volumes (`centralhub_pgdata`, `centralhub_assets_pgdata`,
`centralhub_assets_storage`) are being left in place across sessions instead of
being torn down, so `pnpm stack:up`/`down` don't repeatedly rebuild Postgres and
re-run every migration from empty volumes while §15's test script and other
day-to-day work are still iterating. This is scaffolding-phase convenience, not
a policy change — revert to the delete-`.env`-each-session convention (§3/§5)
once the stack stabilizes, and definitely before any real/shared deployment.

---
