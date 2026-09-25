# Playbook: give an app a real backend

The backend app factory, and the reference app built with it.

> Part of the [CentralHub documentation](../../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

---

## 10e. First real per-app backend (`apps/resource-booking`, `services/booking-api`)

- **Objective**: close the gap every earlier section only ever described —
  §7 built `GET /session/verify-permission` (the "native gate") and §13
  tracked "real mutating backend per app" as not started, since
  `marketing`/`finance` only ever mutated local React state. Resource
  booking is a small, genuinely useful app (book a room, see what's already
  reserved) that gives that endpoint its first real caller.
- **Why native gate, not minted-JWT/RLS**: per §7's "Choosing an enforcement
  model" decision tree — this is first-party code CentralHub controls
  (unlike `assets`/`engineering`, Lovable exports that needed row-level
  enforcement *below* untrusted app code), app-level granularity is enough
  (no per-record rules needed), and instant revocation matters more than a
  15-minute-stale token would allow. So `booking-api` forwards the caller's
  `chub_session` cookie to auth-gateway before any mutation — no shared
  JWT secret, no PostgREST/storage-api layer. (Originally via `/me` +
  `/session/verify-permission` per mutation; since §10f via
  `@centralhub/service-kit`'s single `/session/context` call per request.)
- **Architecture**:
  - `booking-db` — a dedicated Postgres, sibling to `db`/`assets-db`/
    `engineering-db` (per-app-owns-its-data), but with no PostgREST in front
    of it — `booking-api` (a plain Express service; its Pool/retry/
    migration plumbing now comes from `@centralhub/service-kit`, §10f, and
    its schema lives in `src/migrations.ts` as tracked, append-only
    migrations — `0001_init` is the original SQL verbatim) talks to it
    directly.
  - `resources` (rooms) and `bookings` tables. Double-booking is prevented
    at the database layer, not just in application code — a Postgres
    `EXCLUDE USING gist` constraint on `(resource_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&)` (requiring the `btree_gist`
    extension) makes two overlapping bookings for the same room mutually
    exclusive even under a concurrent-request race; `booking-api` catches
    the resulting `23P01 exclusion_violation` and translates it to a `409`.
  - `services/booking-api/src/auth.ts`: two lines — `createAuth()` and
    `createNotifier()` from the kit. `authenticate` (mounted after
    `/health`) resolves identity + permissions once per request; routes use
    `requireVerb("write"|"edit"|"delete")` or `hasVerb(req, "delete")`.
    Read access itself is already enforced ahead of this service by
    Nginx's `auth_request` gate on `/apps/resource-booking/api/`; the kit's
    `read:false → 403` is defense in depth only.
  - A user can always cancel **their own** booking regardless of the
    `delete` verb (`DELETE /bookings/:id` compares `user_sub` first);
    canceling someone else's booking (an admin override) still requires
    `delete` — and, since §10f, **notifies the owner** ("Your booking was
    cancelled … by <admin>", warning tone, linking back to the app) via the
    kit's `notify()` → `POST /internal/notifications`: the first
    app-originated notification producer (§16). Fired after the 204 and
    fire-and-forget, so a notifications hiccup never fails the cancel.
    The day-view chips carry a small × for any booking the viewer can act
    on (their own, or anyone's with `delete`) — found during live testing
    of §10f that the override path had never had a UI, only "Your upcoming
    bookings" (own rows) ever showed a Cancel button.
  - `gateway/conf.d/default.conf`: **no per-app block anymore** — the
    original `^~ /apps/resource-booking/api/` location was replaced by the
    generic `/apps/<name>/api/` → `api-<name>:4200` routing (§4, §10f);
    the compose service is named `api-resource-booking` accordingly.
  - Frontend `lib/api.ts`: a bare 401 from the API (session expired or
    revoked mid-use — previously impossible to observe, since the old
    block redirected to the HTML login page) triggers a full reload so the
    page-level gate redirects to `/auth/login`.
  - Registered the same way every app is (§3 step 4): `app.manifest.json`
    only, picked up by the existing manifest-sync mechanism (§12b) — no
    `KNOWN_APPS`-style edit anywhere. `services/auth-gateway/src/permissions.ts`'s
    `seedDevPermissions()` gained two more `seedRow()` calls (dev-admin: full
    access; dev-user: read+write only, no edit/delete) purely as demo data,
    the same pattern every other app's dev seed follows.
- **Frontend** (`apps/resource-booking`, scaffolded from `apps/_template`):
  a day-view booking board (date navigation with prev/next/today, a booking
  form defaulting to the next upcoming hour — not a fixed time, which used
  to silently book an already-past slot whenever tested later in the day —
  per-room capacity/location badges and a live "Free now"/"In use" status
  badge computed against the current time, booking chips instead of plain
  text rows) plus an admin-only "Manage rooms" panel (rendered only when
  `edit`/`delete` is granted). Canceling a booking and deleting a room both
  go through `packages/ui`'s `ConfirmDialog` — the same "higher-stakes,
  harder-to-undo action gets a confirm step" convention §9 established for
  admin's session-revoke button — rather than acting immediately.
- **Past-time validation, both layers**: the booking form checks the start
  time isn't already in the past before submitting (immediate feedback, no
  round-trip); `booking-api`'s `POST /bookings` independently rejects it
  too (`400`), since the client check is a UX guard only, not the real
  gate — found live while manually testing: a hardcoded default time
  silently created a technically-valid-but-already-past booking that then
  never appeared in "Your upcoming bookings" (deliberately time-filtered,
  `ends_at > now()`) with nothing explaining why.
- **Status**: done — backend, frontend, RBAC wiring, and the UI polish pass
  above are all live and verified against the real stack (real Keycloak
  logins, a real double-booking 409, a real past-time 400, dev-user
  confirmed unable to manage rooms or cancel dev-admin's booking but always
  able to cancel their own); `scripts/test-stack.mjs` extended with an
  11-assertion section covering the native-gate permission boundary, the
  double-booking 409, and the self-cancel-vs-admin-override distinction
  — 137/137 passing.
- **Gotcha worth recording**: both `gateway` and `auth-gateway` bake their
  config/code into the image at build time (`COPY conf.d/`,
  `COPY services/auth-gateway`) — editing `gateway/conf.d/default.conf` or
  `services/auth-gateway/src/permissions.ts` on a running stack does
  **nothing** until those two images are explicitly rebuilt
  (`docker compose build gateway auth-gateway`) and their containers
  recreated. Missing this produced a confusing false signal while verifying
  this app: new Nginx routes and new seed-permission rows silently didn't
  take effect, surfacing as 404s (routing fell through to the frontend's
  own static Nginx) and 403s (`app_permissions` had no row yet) that looked
  like application bugs but were a stale-image issue.
- **Deferred / not built**: no equipment booking (rooms only, by design —
  see the UI/UX discussion this session), no recurring bookings, no
  org-wide room-utilization reporting.

---

---

## 10f. Backend app factory (`packages/service-kit`, `services/_template`, generic API routing)

- **Objective**: §10e proved the native-gate model with a real backend, but
  building it also showed that only the *frontend* half of the app factory
  was templated — `booking-api` was hand-built, and every future backend
  would re-copy the same identity/verb middleware, Pool/retry/migrate
  boilerplate and config, hand-write an Nginx `^~ /apps/<id>/api/` block,
  and have no way to emit notifications. This pass closed those seams
  **before** the next apps, so "add an app with a backend" is now: copy
  `services/_template`, add two compose services, done.
- **`GET /session/context?app=<id>`** (auth-gateway, `routes/session.ts`):
  identity (`sub`/`name`/`email`/`roles`/`department`/`position`/
  `jobLevel`) plus `permissions: { read, write, edit, delete }` for one app
  in a single response — what `/me` and `/session/verify-permission`
  previously needed two hops (and up to two per mutation) to answer. 401
  on a missing/revoked session, 400 without `?app=`, 503 on a DB error;
  the kit treats any non-200 as denied. `/me` and
  `/session/verify-permission` are unchanged.
- **`packages/service-kit`** (`@centralhub/service-kit`): the first
  workspace package built to `dist/` (Node runtime, so unlike
  `packages/ui`'s source-exported `./src/index.ts` it needs `tsc -b` and
  `"main": "./dist/index.js"`); `express`/`pg` are peer dependencies —
  the service owns the versions.
  - `loadServiceConfig()` — `PORT` (default 4200) / `DATABASE_URL` /
    `AUTH_GATEWAY_URL`, the three env vars every backend's compose block sets.
  - `createPool()`, `connectWithRetry()` (lifted from booking-api), and
    `applyMigrations(pool, migrations, name)` — **tracked migrations**:
    a `schema_migrations(id, applied_at)` table, each `{ id, sql }` entry
    runs exactly once per database inside its own transaction and is
    recorded; the list is append-only. Adopting it on a database created by
    the old unversioned boot-time `CREATE TABLE IF NOT EXISTS` is safe when
    that SQL is carried over verbatim as `0001_init` (re-runs as a no-op,
    then gets recorded — verified live on the existing `booking_pgdata`
    volume, and on every restart since).
  - `createAuth({ appId, authGatewayUrl })` → `authenticate` middleware
    (one `/session/context` call, attaches `req.identity` +
    `req.permissions`; fails closed: 401 no/revoked session, 502 gateway
    unreachable or erroring, 403 `read:false`) and `requireVerb(verb)`;
    plus a standalone `hasVerb(req, verb)` for conditional checks inside a
    handler (own-vs-override delete). No HTTP after `authenticate`.
  - `createNotifier({ appId, authGatewayUrl })` → `notify({ recipientSubs,
    title, body?, link?, type?, actorSub?, dedupeKey? })`, posting the
    snake_case body `POST /internal/notifications` expects. **Never throws,
    never rejects** — a notification is a side effect of a mutation that
    already happened, so an outage is logged, not surfaced as a failed
    request. This is the trusted-first-party-backend producer path §13/§16
    described as "designed, not built"; the trigger/outbox pattern remains
    the design for *third-party* RLS apps, which can't be trusted to call
    this directly.
  - `healthRouter` — `GET /health`, mounted before `authenticate`.
  - **First unit tests in the repo**: `packages/service-kit/src/*.test.ts`
    (vitest, mocked `fetch`/pool; 16 tests) — `pnpm test:unit`. Covers the
    authenticate status mapping, requireVerb/hasVerb, notify's never-throw
    contract, and applyMigrations' skip/transaction/rollback logic.
- **`services/_template`**: mirrors `apps/_template` — `package.json`,
  `tsconfig`, `Dockerfile`, and a `src/` wired exactly as booking-api is
  (`config.ts` with `APP_ID`, `db.ts`, `auth.ts`, `migrations.ts`,
  `index.ts`, and an example `routes/notes.ts` showing the three
  permission shapes: read-only, fixed `requireVerb`, conditional `hasVerb`
  + `notify()`). The copy checklist lives in `src/index.ts`'s header. Not
  in compose (same as `apps/_template`).
- **Docker build for kit consumers** (the non-obvious part): the older
  service Dockerfiles copy `package.json` into the runtime stage and
  `npm install --omit=dev` — npm can't resolve `workspace:*`. Kit consumers
  (`booking-api`, `_template`) instead build with
  `pnpm --filter <pkg>... build` (topological — kit first) and
  `pnpm --filter <pkg> deploy --prod /deploy`, which copies the kit's
  `dist` (per its `files`) into a self-contained `node_modules`; the
  runtime stage copies `/deploy`. Verified the deployed image really
  contains `node_modules/@centralhub/service-kit/dist`.
- **Generic backend routing** (`gateway/conf.d/default.conf`, see §4):
  `location ~ ^/apps/([^/]+)/api/(.*)$` → `api-$1:4200/$2`. Convention:
  container `api-<id>`, port 4200 (fixed, like `app-<id>:80`). Placed
  after the `/apps/admin/` block (so `/apps/admin/api/…` stays admin-gated)
  and before the generic frontend regex (first regex match wins). Bare
  401/403/502 — an API surface, not browser navigation. The per-app
  `^~ /apps/resource-booking/api/` block was deleted and compose's
  `booking-api` renamed `api-resource-booking`.
- **Latent platform bug found by the tests, fixed** (`services/auth-gateway/src/revocation.ts`):
  a JWT's `iat` is floored to the second, but `revoked_before` is stored as
  a microsecond `now()` — a session legitimately issued a few hundred ms
  *after* a revocation, in the same wall-clock second, had an `iat` that
  still sorted before it and the user's fresh re-login was rejected as
  revoked. Present since Phase 5; only surfaced now because
  `test-stack.mjs`'s revoke-then-relogin got fast enough to land inside
  one second. Now compared at whole-second granularity (the cost is a
  sub-second window in which a session issued just *before* the
  revocation survives — unavoidable with second-granular `iat`).
- **Test-suite hardening** (`scripts/test-stack.mjs` §6d): the Finance/
  Assets grant assertions counted matching titles inside the 50-row list
  cap, which saturates after enough reruns against the persistent stack
  (a new row pushes an old one out and the delta reads 0), and read once
  immediately after a fire-and-forget producer. Now id-based deltas
  (`maxId`/`countNewByTitle`, with `Number()` — `BIGSERIAL` ids come back
  as strings) with a short poll (`listUntil`).
- **Status**: done — 148/148 in `test-stack.mjs` (11 new assertions:
  `/session/context` shape/401/verbs, bare 401 on API paths, the generic
  API block applying the read gate as a bare 403, admin-override cancel →
  owner unread +1 with the right source app/type), run twice consecutively;
  16/16 unit tests; live-verified in a browser (admin cancels dev-user's
  booking via the new chip ×, dev-user's bell shows it). Deliberately
  **not** done: auth-gateway itself doesn't adopt the kit (it's the
  platform, not an app backend); assets/engineering untouched (third-party
  RLS model); no dev-mode volume mounts for the config-baking gotcha (§10e).

---

---
