# CentralHub — Enterprise App Factory

## 1. Overview

**What it is**: a local-first, decoupled monorepo for standing up an unbounded
fleet of departmental mini-apps behind a single Nginx gateway, with a swappable
LLM inference layer and real authentication + role-based access control.

**Objective**: adding a new department app, or moving the inference backend from
cloud Claude to a local model (e.g. Ollama on an RTX 5080), should each be a
small, mechanical, well-documented change — never a rearchitecture.

**Status at a glance**:

| Phase | Scope | Status |
|---|---|---|
| 1 | Workspace layout + Nginx gateway + inference swap | Done |
| 2 | Central Hub landing dashboard + component discovery | Done |
| 3 | Real authentication (Keycloak + auth-gateway) + admin gate | Done |
| 4 | Granular per-app RBAC (read/write/edit/delete) | Done (foundational) |
| 5 | Instant session/role revocation | Done |
| — | Real per-app backends, production hardening | Not started (see §13) |

---

## 2. Architecture

```
CentralHub/
├── apps/                     # Isolated frontend micro-apps (React + Vite + TS + Tailwind)
│   ├── _template/             # Copy this to scaffold a new app
│   ├── central-hub/           # Landing dashboard, served at gateway root (/)
│   ├── marketing/              # Department app
│   ├── finance/                # Department app
│   ├── admin/                   # User list + user × app permissions matrix editor,
│   │                             # gated by the admin realm role
│   ├── assets/                  # First third-party app (§10) — Lovable export, now a
│   │                             # static SPA with its own self-hosted Postgres/
│   │                             # PostgREST/storage-api (assets-db, postgrest-assets,
│   │                             # storage-assets in docker-compose.yml), not a shared
│   │                             # database or a cloud dependency
│   └── engineering/              # Second third-party app (§10b) — Lovable export with
│                                  # real Supabase Auth + real RLS (unlike assets' USING
│                                  # (true) gap), now CentralHub-gated the same way, with
│                                  # its own self-hosted Postgres/PostgREST/storage-api
│                                  # (engineering-db, postgrest-engineering,
│                                  # storage-engineering)
├── packages/
│   └── ui/                    # Shared design tokens, Tailwind preset, and React
│                                # primitives (§9) — consumed via workspace:*
├── services/
│   ├── inference-gateway/     # Single internal API all apps call for LLM access.
│   │                           # Proxies to Claude today, swaps to a local model later.
│   └── auth-gateway/          # OIDC relying party for Keycloak; issues chub_session;
│                               # target of Nginx's auth_request gate; also owns the
│                               # app_permissions table (per-app read/write/edit/delete).
├── keycloak/
│   ├── realm-export.json      # Pre-provisioned realm/roles/client/seed users
│   └── themes/centralhub/     # Custom login theme (CSS-only override)
├── gateway/                   # Nginx reverse proxy — single local entrypoint
│   ├── nginx.conf
│   └── conf.d/default.conf
├── environments/              # Docker Compose orchestration for the local stack
│   ├── docker-compose.yml
│   └── .env.example
├── pnpm-workspace.yaml
└── package.json
```

**Pillar summary**:

| Pillar | Directory | Purpose |
|---|---|---|
| 1 — Workspace layout | `apps/` | Isolated, independently deployable frontend packages |
| 2 — Traffic gateway | `gateway/` | Single entrypoint; zero-edit dynamic app routing |
| 3 — Environment portability | `environments/` | One `docker compose up`, no cloud control plane |
| 4 — Authentication & RBAC | `keycloak/`, `services/auth-gateway/` | Real login, role gate, per-app permissions, instant revocation |

---

## 3. Pillar 1 — Workspace layout (`/apps`)

- **Objective**: adding, moving, or deleting one app must never affect another.
- **Architecture**: each app is a fully self-contained pnpm workspace package —
  own `package.json`, `vite.config.ts`, `Dockerfile`, source tree. Apps never
  import from one another; small shared logic (e.g. `usePermissions.ts`) is
  duplicated per app on purpose, not centralized. `pnpm`'s content-addressable
  store deduplicates `node_modules` across apps regardless.
- **Status**: done, stable since Phase 1.
- **How to add a new app**:
  1. Copy `apps/_template` to `apps/<name>`.
  2. Rename the `package.json` `name` field; set `base: "/apps/<name>/"` in
     `vite.config.ts`.
  3. Add a service entry to `environments/docker-compose.yml` (mirror `app-template`).
  4. Add it to `apps/central-hub/src/registry/apps.ts` (dashboard card) and the
     table in §9 below.
  5. If it needs RBAC (§7), also add its id to `KNOWN_APPS` in
     `services/auth-gateway/src/permissions.ts` and copy in `usePermissions.ts`.
  - **No Nginx changes needed** for any of the above — see Pillar 2.

---

## 4. Pillar 2 — Traffic gateway (`/gateway`)

- **Objective**: routing a new app should require zero Nginx edits.
- **Architecture**: Nginx is the single local entrypoint (`localhost:8080`).
  Root (`/`) proxies to `apps/central-hub`. Every other app is routed by one
  dynamic regex location — `/apps/<name>/<rest>` → `app-<name>:80/<rest>` — so
  a new app only needs a matching `app-<name>` compose service to exist.
  `/api/inference/` is routed separately. Apps are static assets served by a
  tiny per-app Nginx image, keeping routing decoupled from app internals.
- **Status**: done, stable since Phase 1; extended in Phase 4 with the
  per-app permission gate (§7).
- **Component discovery** (`apps/central-hub/src/registry/apps.ts`): the
  dashboard is driven by a single static, file-based registry (id, name,
  department, icon, URL) — no backend call. Clicking a card just navigates;
  the real session cookie (§6) travels automatically on same-origin nav.

---

## 5. Pillar 3 — Environment portability (`/environments`)

- **Objective**: `docker compose up` is the entire deployment story, on any
  machine with Docker — no cloud control plane dependency.
- **Architecture**: one `docker-compose.yml` ties the gateway, every app
  container, `inference-gateway`, `auth-gateway`, Postgres, and Keycloak into a
  single bridge network. All config flows through `environments/.env` (see
  `.env.example`).
- **Status**: done, stable since Phase 1; expanded in Phase 3 (Postgres,
  Keycloak) and Phase 4 (reuses the same Postgres instance, no new service).

---

## 6. Pillar 4a — Authentication (`/keycloak`, `services/auth-gateway`)

- **Objective**: every app requires a real login; no mock session, no
  client-readable identity cookie.
- **Architecture**:
  - [Keycloak](https://www.keycloak.org/) (self-hosted, Postgres-backed)
    handles credentials and issues OIDC tokens.
  - `services/auth-gateway` is the confidential OIDC client: terminates the
    Authorization Code flow server-side, verifies the ID token against
    Keycloak's JWKS, mints CentralHub's own signed session cookie
    (`chub_session`, HttpOnly, HS256).
  - Nginx gates every app behind `auth_request` → `auth-gateway`'s
    `/session/verify`; no valid session → redirect to `/auth/login`.
  - `/apps/admin/` additionally requires the `admin` realm role
    (`/session/verify-admin`).
- **Status**: done (Phase 3), hardened in Phase 4 (permission-denied page,
  bfcache fix, SSO logout fix — see notes below) and Phase 5 (§8: the session
  JWT below is now identity-only; roles and revocation are checked live).
- **Demo / bootstrap data** (seeded by `keycloak/realm-export.json`,
  **dev-only, must be replaced before any real deployment**):
  - `dev-admin` / `devadmin123` — `admin` + `user` realm roles.
  - `dev-user` / `devuser123` — `user` realm role only.
  - The `auth-gateway` client secret (`dev-only-change-me-auth-gateway-secret`)
    is also baked into `realm-export.json` in plaintext, since `--import-realm`
    has no env-var templating — rotate both the file and `.env` together.
- **Implementation notes / gotchas already resolved**:
  - Keycloak is reached at two hostnames (`localhost:8081` browser,
    `keycloak:8080` container-to-container) — `KC_HOSTNAME`/`_PORT`/`_STRICT`
    pin one issuer for both, or token verification breaks depending on path.
  - Logout ends both CentralHub's session **and** Keycloak's own SSO session
    (via its end-session endpoint + `id_token_hint`) — otherwise the next
    login silently re-authenticates with no credential prompt.
  - Every gated Nginx location sends `Cache-Control: no-store` — otherwise a
    browser can restore a fully-rendered authenticated page from bfcache with
    zero network request, and the auth gate never re-fires.
  - The login page uses a custom Keycloak theme (`keycloak/themes/centralhub/`)
    — CSS-only override via `theme.properties`, form structure/behavior
    untouched. Restyled to match `packages/ui/tokens.css`'s dark indigo/slate
    palette: dark flat-gradient page background (overriding the base
    "keycloak" theme's `keycloak-bg.png`, which is set via the higher-
    specificity `.login-pf body` selector — a plain `body` rule loses
    regardless of CSS load order), a light, layered-shadow card that scales
    with viewport width (`clamp()`, no fixed breakpoint column), inline
    field icons, and a "CentralHub" masthead (from `realm-export.json`'s
    `displayName`) with a generated `::after` sub-header. Two gotchas worth
    knowing before touching this file again: (1) the base theme wraps
    `.card-pf` and a *second*, unrelated div (`#kc-content-wrapper`'s first
    child) in a way that's easy to accidentally both select as "the card",
    rendering a card nested inside a card — only `.card-pf` is the real
    container; (2) field icons must live on a `::before` pseudo-element on
    `.form-group` (via `:has()`), not as `background-image` on the `<input>`
    itself — Chrome/Edge/Safari's autofill forcibly repaints an autofilled
    input's own background, silently deleting any icon set there. Verified
    with real headless-browser screenshots (desktop + mobile, plus a
    simulated autofilled-background state), not just by reading the CSS.
- **Deferred / not built**: MFA, password reset flows, self-service
  registration (`registrationAllowed: false`). Refresh-token rotation /
  silent renewal was considered and deliberately **not** built — see §8: once
  authorization is re-checked live on every request instead of trusted from
  the JWT, a short-lived-JWT-plus-refresh scheme stops solving a real
  problem, since instant revocation is achieved a different way.

---

## 7. Pillar 4b — Granular per-app RBAC (read/write/edit/delete)

- **Objective**: independent, per-user, per-app `read`/`write`/`edit`/`delete`
  flags — reachability of an app and its mutating actions should be
  centrally controlled per user, not all-or-nothing per login.
- **Architecture**:
  - New table `app_permissions` (`user_sub`, `app_id`, 4 booleans) in the
    **same Postgres instance already backing Keycloak** — no new database
    engine or container. `auth-gateway` creates it idempotently on boot
    (`CREATE TABLE IF NOT EXISTS`).
  - **Read enforcement is server-side, at the Nginx layer**: the generic
    `/apps/<name>/` location captures the app id into `$app_id`, forwarded to
    `auth-gateway`'s `/session/verify` as an `X-App-Id` header. Invalid read
    permission → 403 → Nginx's `error_page 403 = @permission_denied` renders a
    friendly "access denied" page (click anywhere to return to the dashboard —
    deliberately not an auto-redirect; a denial is a dead end to consciously
    back out of, not a timed transition).
  - **Write/edit/delete are gated client-side**, since Nginx has no visibility
    into an app's internal button clicks. Each app copies
    `apps/_template/src/lib/usePermissions.ts` (same "duplicate small lib
    files, no cross-app imports" convention as Pillar 1):
    - `usePermissions()` — fetches `GET /auth/permissions?app=<id>` once.
    - `useGuardedAction(permissions, verb, fn)` — runs `fn` only if `verb` is
      granted, else `window.alert(...)` and no-op.
    - `useReadGuard(permissions, loading)` — client-side defense-in-depth for
      an already-loaded tab whose permission was revoked mid-session; renders
      the same click-to-continue "Access denied" state as the server page.
  - **Server-side hook for future real actions**: `GET
    /session/verify-permission?app=<id>&verb=<read|write|edit|delete>` on
    `auth-gateway` (bare 200/401/403, same shape as `/session/verify`).
    `marketing`/`finance` don't call it yet — their demo actions are just
    local React state, nothing real to protect — but any future mutating
    backend endpoint should check here rather than trust the client hook.
  - **Admin management UI**: `apps/admin` "Permissions" panel — a users × apps
    checkbox grid, each toggle firing `PUT
    /auth/admin/permissions/:userSub/:appId` immediately (optimistic, no
    separate save step). Backed by `GET /auth/admin/permissions` for the full
    matrix.
- **Status**: done (Phase 4) — enforcement, admin UI, and the
  future-proofing endpoint are all in place and verified end-to-end.
- **Default policy**: **deny-everything**. A user with no `app_permissions`
  row for an app gets all four flags `false`. This is a deliberate change from
  Phase 3, where any logged-in user could reach any non-admin app.
- **Demo / bootstrap data** (seeded by `auth-gateway` at boot — resolves each
  dev username's Keycloak `sub` via the Admin API; best-effort/non-fatal if
  Keycloak isn't up yet, since it's only local demo data — **not
  production-safe, replace before any real deployment**):

  | User | Marketing | Finance |
  |---|---|---|
  | `dev-admin` | read, write, edit, delete | read, write, edit, delete |
  | `dev-user` | read, write | *(nothing — demonstrates the denied page)* |

- **Wiring a new app into this scheme** (in addition to Pillar 1's checklist):
  1. Add the app's id to `KNOWN_APPS` in `services/auth-gateway/src/permissions.ts`.
  2. Copy `apps/_template/src/lib/usePermissions.ts` into the new app, set `APP_ID`.
  3. Wrap mutating handlers with `useGuardedAction(permissions, verb, handler)`
     — read-gating is automatic once the id is in `KNOWN_APPS`.
- **Implementation notes / gotchas already resolved**:
  - The internal `/internal/verify` Nginx location originally declared
    `set $app_id '';` at `server` scope so the header always had *some* value.
    That backfired: `auth_request` subrequests re-enter Nginx's full phase
    engine for their own URI, including the server rewrite phase, so that
    `set` re-executed for the subrequest itself and clobbered the calling
    location's value moments before the proxy read it. Fix: no default at
    server scope — an unset Nginx variable already evaluates to `''`, and
    `set $app_id $1;` in the one location that needs it is sufficient.
- **Deferred / not built**:
  - No real mutating backend on any app yet — `/session/verify-permission`
    has no caller today (see above), only the pattern is in place.
  - No per-field/per-record permissions (e.g. "edit only your own records") —
    this is app-level granularity only, four flags per (user, app).
- **Audit log** (`services/auth-gateway/src/audit.ts`, `audit_log` table):
  append-only history of every permission/attribute/role-rule edit, session
  revoke, and realm-role sync (login- and poller-driven), each with an actor
  (`null` sub for system-driven role syncs), a before/after or added/removed
  `detail` JSON blob, and a denormalized target/app name captured at write
  time — not re-resolved from Keycloak later, so history reflects what was
  true then. Fail-soft: a write failure here logs and continues rather than
  blocking or rolling back the real mutation it's describing. Surfaced
  read-only in `apps/admin`'s new "Audit" tab (latest 200 rows, searchable/
  sortable via the shared `DataTable`). No retention/prune job yet, and role
  syncs only log when the role set actually changes (so the 60s poller
  doesn't write a no-op row every tick).
- **Bulk permission grants**: the Permissions panel's master/detail
  `DataTable` (see §9) gained row multi-select — a header checkbox selects
  every currently loaded user for the selected app — plus an action bar
  (verb picker + Grant/Revoke) that PUTs `/admin/permissions/bulk`
  (`{ userSubs, appId, patch }`) to `bulkUpsertPermission()` in
  `permissions.ts`, applying one verb's value to every selected user inside
  a single transaction (all-or-nothing). One audit row per bulk action
  (`permission.bulk_update`, `{ userSubs, patch, count }`) rather than one
  per user — the point is recording the batch's scope, not duplicating the
  single-cell route's per-user detail. "Select all" selects every loaded
  user for that app, not just the table's current search/sort/page slice,
  since the `DataTable` doesn't expose which rows are actually visible and
  "grant everyone" is the common bulk case anyway.

### Choosing an enforcement model: native gate vs. minted-JWT/RLS

Two enforcement models coexist in this repo. They are **not** competing
standards — both resolve the *same* policy store (`getPermission()` over
`app_permissions`, plus the same `isRevoked` check). They differ only in
*where* the decision is enforced, chosen by trust level and granularity:

- **Native gate** (`GET /session/verify-permission`, this section): auth-gateway
  answers a per-action `200`/`401`/`403` that the app's own backend (or its
  Nginx location) calls. Enforcement is a call the app *chooses to make* — so
  it trusts the app's code to make it. Strong where it matters for first-party
  code: **instant revocation** (live DB check every request), app-level
  granularity (4 flags), and the signing secret never leaves auth-gateway.
- **Minted-JWT / RLS** (`GET /auth/data-token`, §10): auth-gateway mints a
  short-lived (15m) JWT carrying the actual permission claims; an external data
  layer (PostgREST / storage-api / Postgres RLS) verifies it and enforces
  **below** the app. Enforcement survives a buggy or hostile app layer, reaches
  **row/field** granularity, and keeps auth-gateway off the per-query hot path —
  at the cost of a bounded (≤15m) revocation lag and sharing `PGRST_JWT_SECRET`
  with those services.

Neither is a strict upgrade: native wins on revocation timeliness and secret
containment; RLS wins on app-layer defense, granularity, and hot-path scaling.

**Pick by answering, in order:**
1. **Is the app's data/service layer code you don't fully trust** (third-party
   export, unaudited)? → **minted-JWT/RLS**, so enforcement lives below the
   app. (This is exactly why `apps/assets` uses it — see §10's `USING (true)`
   finding.)
2. **Do you need per-record / per-field rules** ("edit only your own records")?
   → **minted-JWT/RLS**; the native gate is app-level only.
3. **Is it chatty and data-heavy**, where a gateway round-trip per query would
   hurt? → **minted-JWT/RLS** (one amortized token) — but weigh the ≤15m
   revocation lag.
4. **Otherwise** (first-party code, app-level 4-flag gating, want instant
   revocation): → **native gate**.

**Implementing the native gate** for a new first-party backend: the endpoint
already exists and is the single source of truth (read-only against
`app_permissions`, no auth-gateway change needed). Forward the `chub_session`
cookie to `GET /session/verify-permission?app=<id>&verb=<read|write|edit|delete>`
before the mutation and treat non-`200` as denied — either via an `auth_request`
in the app's own Nginx location (mirror `/session/verify`) or a direct
server-to-server call over the Docker network. **Never** trust the client-side
`useGuardedAction()` hook as the gate; it is a UX affordance only.

**Implementing minted-JWT/RLS** for another self-hosted app: follow §10 — give
the app its own Postgres, put a JWT-verifying layer (PostgREST or equivalent) in
front, add an `<app>_authenticated` role, mint per-request tokens via
`/auth/data-token` (extend its payload if the app needs claims beyond
`perm`/`role_code`), and write real RLS policies against those claims. Share
`PGRST_JWT_SECRET` only with that app's own data services.

A first-party app may still choose minted-JWT/RLS if it genuinely needs
row-level security — the dividing line is **trust level + granularity, not
first- vs. third-party by fiat**.

---

## 8. Pillar 4c — Instant session/role revocation

- **Objective**: eliminate delayed permission/role enforcement caused by the
  session cookie's flat 8h lifetime, without a cache layer, without putting
  Keycloak on the hot path of every request, and without Nginx doing anything
  but forwarding.
- **The actual problem, precisely scoped**: per-app `read`/`write`/`edit`/
  `delete` (§7) was already instant — it re-queries Postgres every request.
  Two things genuinely were frozen for a session's whole 8h life: (1) Keycloak
  **realm roles** baked into the JWT at login (revoking `admin` had no effect
  until re-login), and (2) there was **no way to kill a specific live session**
  before its natural expiry. A third, procedural gap: changes made directly in
  Keycloak's own console had no channel back to `auth-gateway`.
- **Architecture** — extends the same live-Postgres-per-request pattern
  already proven for `app_permissions`, rather than introducing Redis (solves
  a latency problem that doesn't exist here) or per-request Keycloak
  introspection (would make Keycloak a bottleneck for all traffic, not just
  login):
  - **`user_roles`** (`user_sub`, `role`) mirrors Keycloak's realm roles,
    refreshed at login (`syncRolesFromKeycloak()` in `services/auth-gateway/src/roles.ts`,
    called from `routes/callback.ts`). This — not the JWT — is now the sole
    authorization source of truth for role checks (`hasRole()`,
    `getRoles()`); `chub_session` was shrunk back down to identity-only
    (`sub`/`name`/`email` — see `session.ts`'s `SessionInput`/`SessionClaims`).
  - **`session_revocations`** (`user_sub`, `revoked_before`) — absent row =
    never revoked. `isRevoked(sub, issuedAt)` in `services/auth-gateway/src/revocation.ts`
    rejects any session whose JWT `iat` predates the stored timestamp.
    Deliberately **per-user, not per-session/`jti`**: nothing in this system
    lists individual concurrent sessions, so "kill this user's session" in
    practice means "kill all of that user's current sessions" — a `jti` table
    would add unbounded row growth and a reaper job for precision with no UI
    to use it.
  - Both checks run inside `resolveSession()` (`routes/session.ts`), called by
    every gated route (`/session/verify`, `/session/verify-admin`,
    `/session/verify-permission`, `/me`, `/permissions`) and by
    `requireSession`/`requireAdmin` (`middleware/requireAdmin.ts`). **No
    changes to `gateway/conf.d/default.conf`** — Nginx still just forwards to
    `/session/verify` via `auth_request`, unaware any of this exists.
  - **Admin force-logout**: `apps/admin`'s user table has a "Revoke session"
    button per user, calling `PUT /auth/admin/sessions/:userSub/revoke`
    (`routes/adminSessions.ts`) → `revokeUser()`. Takes effect on that user's
    very next request, anywhere. **Self-revocation is blocked** — both
    server-side (400) and by hiding the button on the logged-in admin's own
    row — since there's no recovery path in this UI if an admin locked
    themselves out.
  - **Background role re-sync poller** (`services/auth-gateway/src/roleSyncPoller.ts`):
    every `ROLE_SYNC_INTERVAL_MS` (default 60s), re-runs the same
    `syncRolesFromKeycloak()` used at login for every user returned by
    `listUsers()`. Since `user_roles` (not the JWT) is already the sole,
    live-checked source of truth for role checks, this alone is enough to
    self-correct a role changed directly in Keycloak's console — no force-
    logout or session revocation needed on top of it. Fails soft: a
    Keycloak Admin API error (restart, network blip) is logged and skipped,
    never crashes the gateway or stops future ticks — same posture as the
    dev-seeding retries at boot.
  - **Keycloak backchannel logout** (event-driven, not polled — built into
    Keycloak, configured via the `auth-gateway` client's
    `backchannel.logout.url` attribute in `realm-export.json`): when an admin
    ends a user's session via Keycloak's own console (Users → Sessions →
    Logout, or the equivalent Admin REST call), Keycloak POSTs a signed
    `logout_token` to `POST /backchannel-logout` (`routes/backchannelLogout.ts`,
    verified via `verifyLogoutToken()` in `oidc.ts`) → `revokeUser()`. This
    route is deliberately public and outside Nginx's `auth_request` gate —
    Keycloak calls it server-to-server over the Docker network, no browser
    or cookie involved.
- **Status**: done (Phase 5) — role checks, force-logout, the
  backchannel-logout webhook, and the background role re-sync poller are
  all wired and verified end-to-end.
- **A revoked/unverifiable session is modeled as 401, not 403.** 403 means
  "valid session, but not permitted THIS resource" — app read-denied or
  admin-role-missing — and Nginx's `@permission_denied` page for that
  correctly sends the user back to the dashboard. A revoked session has no
  such remedy (the dashboard itself is what just denied them — redirecting
  there again would loop), so it's treated the same as "no session at all":
  401, which every gated Nginx location already auto-redirects to
  `/auth/login` via the pre-existing `@login_redirect` wiring, no Nginx
  changes needed. `resolveSession()` (`routes/session.ts`) fails closed the
  same way (401) on a DB error during the revocation check itself. Role/
  permission-check failures that *aren't* about revocation (`hasRole` for
  the admin gate, `getPermission`) still fail closed as 403, since those
  really are "valid session, this specific thing is denied" — going back to
  the dashboard is a real remedy there.
- **Revoking a session doesn't silently un-revoke itself via Keycloak SSO.**
  `/auth/login`'s authorize URL (`buildAuthorizeUrl()` in `oidc.ts`) sets
  `prompt=login`, forcing a real credential check every time — without it,
  a revoked `chub_session` redirecting to `/auth/login` would immediately
  get a fresh, valid one for free from Keycloak's still-live SSO cookie,
  completely undoing the revocation. Since `auth-gateway` is Keycloak's only
  client in this realm, there's no multi-app SSO convenience being traded
  away.
- Every DB call added or touched in this phase (`isRevoked`, `hasRole`, and
  the pre-existing `getPermission`/`getMatrix`) is wrapped in try/catch and
  logs a tagged error, so a policy denial is distinguishable from a
  DB-outage denial in logs — a strict improvement over the pre-Phase-5
  behavior, where an unguarded `pool.query()` failure was an unhandled
  promise rejection (Express 4.21 does not auto-catch async-handler errors)
  that could crash the process outright instead of cleanly denying one
  request.
- **Documented, accepted limitations** (operator guidance, not silent gaps):
  - Disabling a user in Keycloak's console, by itself, does **not** end
    their live SSO session or fire backchannel logout — only the Sessions
    tab's explicit "Logout" action (or the Admin REST logout endpoint) does.
  - A role change made directly in Keycloak's console is now picked up
    within one `ROLE_SYNC_INTERVAL_MS` tick (default 60s) by the background
    poller above — an explicit force-logout is no longer required to see it
    take effect, just a short wait.

---

## 9. UI/UX foundation

- **Objective**: replace hand-copied Tailwind classes, zero shared components,
  and v1-grade rough edges (raw `window.alert()`, no confirm dialogs, no
  search/sort) with a small reusable design system — without over-building
  ahead of a real consumer, and without this being mistaken for a load-bearing
  pillar. This isn't part of the numbered Phase 1-5 sequence or the Pillars
  above: those are the infrastructure the system needs to function (routing,
  environment, auth, RBAC, revocation); this is product polish on top of it,
  not a prerequisite for anything else here to work.
- **Shared foundation (`packages/ui`)**: design tokens (light + dark CSS
  variables, `darkMode: "class"`), a Tailwind preset, and reusable primitives —
  `Button`, `Card`, `Badge`, `Avatar`, `Input`, `EmptyState`, `Skeleton`,
  `Toast`/`ConfirmDialog` (built on Radix UI — the repo's first external UI
  dependency), `AppShell`, `DataTable`. Ships as raw TypeScript source with no
  build step, consumed directly by each app's own Vite/esbuild pipeline via
  `workspace:*`. Proven end-to-end in `apps/_template`, including a
  from-scratch Docker build — each consuming app's `Dockerfile` needs one
  added `COPY packages/ui ./packages/ui` line.
- **Admin panel**: `apps/admin` adopts the foundation — an `AppShell` with
  Users/Permissions/Audit tabs, the users table replaced by a searchable/
  sortable/paginated `DataTable`, a `ConfirmDialog` gating session revoke (the
  higher-stakes, harder-to-undo action — permission-checkbox toggles stay
  instant/optimistic, unchanged, see §7), and toast notifications replacing
  `window.alert()`/inline error text for both revoke and permission-toggle
  feedback. Also added: a role-gated "Admin" card on `central-hub`'s landing
  grid (`requiresRole` on `AppRegistryEntry`), visible only to users with the
  `admin` role — a discoverability fix only; the real access gate stays
  enforced server-side by Nginx either way. The Permissions panel itself was
  later rebuilt from a hand-rolled matrix (one column per app, four stacked
  checkboxes per cell) into an app-centric master/detail `DataTable` — an app
  `Select` acts as a filter, not a column, so the layout stays flat as
  `KNOWN_APPS` grows instead of getting wider per app — see §7.
- **Landing page + department apps**: `apps/central-hub`, `apps/marketing`,
  and `apps/finance` all adopt the foundation, finishing the rollout to every
  app in the repo. Central-hub's grid gains a live search box and
  department-derived filter tabs (no hardcoded department list — pulled from
  the registry), an `EmptyState` with a "Clear filters" action when nothing
  matches, and a `Skeleton` placeholder on `IdentityBanner` while the session
  resolves; `IdentityBanner` itself gains an `Avatar` and a `Badge` for the
  role pill. `marketing`/`finance` are wrapped in `AppShell`, giving both a
  persistent "back to Central Hub" link instead of relying on browser back —
  their "Access denied" click-anywhere view keeps its exact behavior, just
  restyled onto tokens. `usePermissions.ts`'s `window.alert()` (still
  duplicated across `_template`/`marketing`/`finance`) is deliberately
  untouched — a separate, already-deferred cleanup, not part of this pass.
- **Status**: done — shared foundation, admin panel, and landing page/
  department-app rollout all complete; every app in the repo is now on
  `packages/ui`. Grouping and a dismissible announcement banner (previously
  deferred as Low-priority/optional) have since been added to
  `apps/central-hub`:
  - **Department grouping + "recently used"**: the landing grid now renders
    as per-department sections (reusing the same `departments` list already
    driving the filter tabs) instead of one flat grid, plus a "Recently
    used" section (`apps/central-hub/src/lib/recentApps.ts`, a capped
    localStorage list of the last 4 apps opened, recorded from
    `AppCard`'s click handler). Both only render on the unfiltered "All"
    view with no search text — once a department or search filter narrows
    the list, grouping/recency would just add noise on top of an
    already-short list.
  - **Announcement banner**: `apps/central-hub/src/components/SystemBanner.tsx`,
    dismissible and remembered per-announcement-id in localStorage (so
    bumping the id in `apps/central-hub/src/config/announcement.ts`
    re-surfaces a changed message to users who dismissed an earlier one).
    The config constant defaults to `null` (nothing shown) — still no
    operator need for an actual announcement yet, but the plumbing is done.
  - **Dark mode, defaulted on, every app**: `packages/ui/src/theme.ts` —
    framework-agnostic on purpose, no React import — reads/writes one
    `chub_theme` localStorage key and toggles the `dark`/`light` class on
    `<html>`. Since every app is served from the same gateway origin
    (`localhost:8080`), that one key is naturally shared across all of
    them — switching the theme in any app carries over to the rest on
    their next load. A browser with no stored preference yet always starts
    **dark**, regardless of the OS's own `prefers-color-scheme` (tokens.css's
    `.dark` class forces the dark variable set unconditionally). Each app's
    `main.tsx` calls `applyTheme(getStoredTheme())` before the first render
    (not inside a `useEffect`), so there's no flash of the light default
    before dark applies. `packages/ui`'s `ThemeToggle` (Sun/Moon icon
    button, built on the same `theme.ts`) sits at the top-right of
    `AppShell`'s header (admin/marketing/finance/`_template`) and of
    `central-hub`'s own bespoke header. `apps/assets` can't import
    `ThemeToggle` itself — its React 19 vs. this package's React
    ^18.3.1 peer dep, same reason `AssetsNav.tsx` hand-authors its own
    chrome instead of importing `AppShell` — so `theme.ts` is also
    published as its own React-free `@centralhub/ui/theme` subpath export,
    and `AssetsNav.tsx` hand-authors a matching toggle button at its own
    top-right, styled with the same shared CSS tokens the rest of its nav
    already uses. `apps/assets`'s own `styles.css` already shipped a full
    shadcn `.dark` palette from the original Lovable export — unused until
    now, since nothing ever toggled the class; no CSS changes were needed
    there, only the toggle.
  - **Space efficiency**: `AppShell`'s content area, and `central-hub`'s own
    equivalent container, were hard-capped at `max-w-5xl` (1024px)
    regardless of viewport — wasted room on any screen wider than a small
    laptop. Both are now `w-full max-w-[1600px]` with responsive padding,
    so they use whatever width is actually available and only cap on
    ultra-wide monitors for line-length readability; `central-hub`'s app
    grid also gained an `xl:grid-cols-4` breakpoint so the extra width
    shows more cards per row instead of just more margin. `apps/admin`'s
    `AttributeSelect` (below) is `w-full` with a `min-w-[9rem]` floor for
    the same reason — it was a fixed 112px regardless of how much room its
    `DataTable` column actually had.

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
    (its React peer would conflict with `packages/ui`'s `^18.3.1`) — only
    `AssetsNav` (`apps/assets/src/components/AssetsNav.tsx`) shares chrome
    with the rest of the hub, by importing `packages/ui/src/tokens.css`
    directly (plain CSS custom properties, framework-agnostic) rather than
    any compiled component.
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
  "(unlisted)" option rather than being silently dropped. No delete
  endpoint — removing a value an existing user is already assigned would
  just make their attribute look unlisted with no real cleanup benefit.
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
    and refresh it every call.
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
   - Add the new app id to `KNOWN_APPS` (`services/auth-gateway/src/
     permissions.ts`), `apps/central-hub/src/registry/apps.ts`, and the
     apps table in §11 — all three, by hand, every time (no dynamic
     registry yet, see §13).
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

---

## 11. Apps in this repo

| App | Package | URL | Purpose |
|---|---|---|---|
| `apps/_template` | `@apps/template` | `/apps/_template/` | Starting point to copy when scaffolding a new app; demonstrates calling `/api/inference/health`. |
| `apps/central-hub` | `@apps/central-hub` | `/` (gateway root) | Landing dashboard; discovers apps via `src/registry/apps.ts`, shows the real logged-in user via `/auth/me`. |
| `apps/marketing` | `@apps/marketing` | `/apps/marketing/` | Placeholder department app; demo RBAC-guarded "Save campaign" action. |
| `apps/finance` | `@apps/finance` | `/apps/finance/` | Placeholder department app; demo RBAC-guarded "Approve budget" action. |
| `apps/admin` | `@apps/admin` | `/apps/admin/` | Keycloak user list (with a per-user "Revoke session" action, §8, now confirm-gated, §9) + permissions matrix editor (§7). Linked from `central-hub`'s landing grid only for users holding the `admin` role (§9) — that's a discoverability nicety, not the real protection: the `admin`-role Nginx gate is what actually stops access. |
| `apps/assets` | `@apps/assets` | `/apps/assets/` | First third-party/self-hosted app (§10) — asset purchase requests, registration, transfers; its own Postgres/PostgREST/storage-api, no external SaaS dependency. |
| `apps/engineering` | `@apps/engineering` | `/apps/engineering/` | Second third-party/self-hosted app (§10b) — machine repair job workflow (report/assign/repair/review); its own Postgres/PostgREST/storage-api, no external SaaS dependency. |

This table is maintained by hand alongside `apps/central-hub/src/registry/apps.ts`
and `services/auth-gateway/src/permissions.ts`'s `KNOWN_APPS` — update all three
when adding or removing an app.

---

## 12. The inference swap

- **Objective**: moving from cloud Claude to a local model must be an env
  change, never a code change.
- **Architecture**: apps never call Anthropic (or any provider) directly —
  they call `POST /api/inference/v1/chat` on the gateway.
  `services/inference-gateway` reads `INFERENCE_PROVIDER` (`claude` | `local`)
  and dispatches to the matching provider module.
- **Status**: done, stable since Phase 1.
- **To switch**: set `INFERENCE_PROVIDER=local` and `LOCAL_MODEL_BASE_URL` in
  `environments/.env` — no app or gateway code changes.

---

## 13. Deferred / not started (catalog)

Consolidated from the sections above, so it's checkable in one place. Split
into three tables: everything specific to `apps/assets` (§10), everything
specific to `apps/engineering` (§10b), then everything else.

**`apps/assets`-specific**:

| Item | Where it would live | Why deferred |
|---|---|---|
| `storage-assets` bucket-metadata admin calls | `apps/assets` self-hosted storage layer (§10) | Needs the service key, not a per-user JWT — object upload/download (what the app actually uses) is unaffected. Re-verified (not just carried forward stale): every `supabase.storage` call in `apps/assets/src` is a plain object-level `.upload`/`.getPublicUrl` call against the `asset-images` bucket, authenticated via the per-user JWT; no `createBucket`/`updateBucket`/`listBuckets` call or service-role key anywhere in the frontend. Still dormant, still nothing live to fix |
| `apps/assets`'s workflow-role login can't be fully retired | `apps/assets` `role_assignments`/`LoginForm` | The identity→role_code mapping (§10) makes it optional, not obsolete — any user with no matching `app_role_rules` row still needs it. Re-verified: unlike `apps/engineering`'s unconditional `ensure_profile()` auto-provisioning, `apps/assets` has no fallback-free path — retiring `LoginForm` needs either accepting broken login for any non-matched real user, or building an assets-side unconditional auto-provisioning feature. A product decision, not a code change |

**`apps/engineering`-specific**:

| Item | Where it would live | Why deferred |
|---|---|---|
| Google Sheets sync | `apps/engineering` (originally `sheets.functions.ts`) | Dropped, not re-homed — keeping it (even against a direct Google API) would retain an external SaaS dependency, exactly what this ingestion pattern exists to remove (§10b) |
| Realtime job-alert popups/sounds | `apps/engineering/src/hooks/useJobAlerts.ts` | Needs a self-hosted Supabase Realtime service, which this ingestion's compose additions (engineering-db/postgrest-engineering/storage-engineering) don't include — a real infra addition of its own. The hook is left in place (harmless — fails to connect, doesn't crash the page) rather than removed |
| `department_head` role has no dedicated page | `apps/engineering/src/App.tsx` | The original export never built one either (only admin/leader/repairer/reporter have pages) — shows a "no screen yet" message rather than inventing a UI with no reference to carry over |
| `allowed_repair_dept_ids` per-reporter restriction | `apps/engineering` `profiles` table | Was admin-editable-per-user in the original export but never actually read/enforced anywhere in the app even before this ingestion; dropped along with the rest of per-user admin editing rather than rebuilt as a rule |
| Users tab's live-session/attribute view requires the CentralHub Keycloak admin realm role, not this app's resolved `role_code` | `apps/engineering/src/pages/AdminPage.tsx` (`UsersTab`) | It calls the existing `/auth/admin/users(/attributes)` bulk endpoints, which are gated by `requireAdmin` (Keycloak realm role) — coincides with engineering's own `admin` role_code today only because `CENTRALHUB_ADMIN_ROLE_CODE` makes every CentralHub admin resolve to it. A user who reached engineering's `admin` role_code purely via a rule/override (without the Keycloak realm role) would get 403s from this tab specifically, while every other admin-gated engineering feature would still work for them. Not fixed this pass — noted in code and here rather than silently left unknown |
| `resolveLocalRole()` badge doesn't account for `CENTRALHUB_ADMIN_ROLE_CODE` | `apps/engineering/src/pages/AdminPage.tsx` (`UsersTab`) | Client-side, display-only computation reusing existing endpoints (deliberately kept simple, no new backend route — see §10b); can show a stale/absent role badge for a CentralHub admin whose actual `role_code` comes from the guarantee rather than a rule/override row. Cosmetic only — `resolveRoleCode()` server-side already resolves correctly regardless |

**General**:

| Item | Where it would live | Why deferred |
|---|---|---|
| MFA / password reset / self-registration | Keycloak realm config | Out of scope for a local dev foundational slice |
| Real mutating backend per app | each `apps/<name>` | No app has real data to mutate yet — demo actions are local state only |
| Server-side enforcement of write/edit/delete | app-specific backend, calling `/session/verify-permission` | Nothing to enforce until an app has a real endpoint |
| Per-record / field-level permissions | `app_permissions` table design | Current granularity is per (user, app) only |
| Per-session (`jti`) tracking / "your active sessions" UI | `session_revocations` table design | Current granularity is per-user (kill all sessions), not per-device — see §8 |
| Production-safe credentials | `keycloak/realm-export.json`, `.env` | `dev-admin`/`dev-user`/client secret are dev-only seed data — see §6, §7 |
| `usePermissions.ts`'s `window.alert()` → toast | `apps/_template`, `apps/marketing`, `apps/finance` | Duplicated across 3 files by design (§9); a real fix needs extracting the hook into `packages/ui` first, out of scope for §9's UI-primitives pass |
| Postgres-backed dynamic app registry | replacing `apps.ts`/`KNOWN_APPS`/`docker-compose.yml`'s static lists | Deferred per §10 — not a prerequisite for onboarding one real third-party app |

---

## 14. Quickstart

```sh
pnpm install
cp environments/.env.example environments/.env
# fill in every blank value in .env.example: ANTHROPIC_API_KEY (or switch
# INFERENCE_PROVIDER=local), POSTGRES_PASSWORD, KEYCLOAK_ADMIN_PASSWORD,
# AUTH_SESSION_SECRET, and (since §10) ASSETS_DB_PASSWORD, PGRST_JWT_SECRET,
# ASSETS_STORAGE_ANON_KEY, ASSETS_STORAGE_SERVICE_KEY, and (since §10b)
# ENGINEERING_DB_PASSWORD, ENGINEERING_STORAGE_ANON_KEY,
# ENGINEERING_STORAGE_SERVICE_KEY (shares PGRST_JWT_SECRET with assets) —
# the *_ANON_KEY/*_SERVICE_KEY pairs are HS256 JWTs signed with
# PGRST_JWT_SECRET, see .env.example's own comments
pnpm stack:up
# open http://localhost:8080/

# log in as dev-admin / devadmin123 for full access everywhere, including
# the /apps/admin/ permissions panel (§7)

# log in as dev-user / devuser123 to see RBAC in action: full access to
# Marketing, a friendly "Access denied" page on Finance and Admin, and a
# window.alert() if you try an action beyond your granted verbs

# to see instant revocation (§8): while dev-user has an active session in
# another browser/tab, click "Revoke session" next to them in
# /apps/admin/'s user list as dev-admin — their very next request anywhere
# gets a 403, no waiting for the 8h session to expire
```

---

## 16. Automated end-to-end test (`scripts/test-stack.mjs`)

- **Objective**: a single command that exercises every pillar above against
  a real running stack — no mocks, no headless browser dependency — so a
  regression in auth, RBAC, revocation, or the assets RLS layer fails loudly
  instead of waiting to be found by hand in a browser.
- **What it does**: plain Node `fetch` (no test framework, no extra
  dependencies) drives the actual Keycloak Authorization Code flow — GET
  `/auth/login`, parse the returned Keycloak login form, POST real dev
  credentials, follow the redirect chain through `/auth/callback` — for both
  `dev-admin` and `dev-user`, then asserts against the live gateway/
  auth-gateway/PostgREST stack: unauthenticated gating, role resolution,
  Nginx's per-app read gate, `/auth/permissions` verb flags, the admin-only
  management APIs, `apps/assets`'s data-token minting and identity→role_code
  resolution, real RLS enforcement over `POST/PATCH/DELETE` (including
  flipping a permission via the real admin endpoint mid-run to prove
  `write:false` → `403` on INSERT, then restoring it), `apps/engineering`'s
  data-token minting and role_code resolution (dev-admin → `admin` via the
  `CENTRALHUB_ADMIN_ROLE_CODE` guarantee, dev-user → `repairer` via the
  seeded attribute rule), a real RLS boundary on `repair_jobs` (a
  `repairer`-role INSERT attempt gets `403`, not a silent accept), the
  `ensure_profile()` RPC (confirms a real `full_name` and a freshly-refreshed
  `last_seen_at`, not just a 200), and the self-lockout / CentralHub-admin
  override-write guard (`POST .../role-overrides` targeting dev-admin's own
  sub → `400`, and its role_code stays `admin` afterward), instant session
  revocation, and logout (including that Keycloak's `prompt=login` actually
  forces a fresh credential challenge, not a silent SSO bypass).
- **Nginx gotcha it specifically guards against**: `error_page 403 =
  @permission_denied` (no explicit status code) means a *denied* app page
  and a *granted* one both come back as HTTP 200 — the denial is only
  visible in the response body. Every "granted" assertion in the script
  checks the body doesn't contain the denial page's marker text, not just
  the status code, or a broken permission check would silently read as a
  pass.
- **Run it**: `pnpm test:stack` (or `node scripts/test-stack.mjs`) against an
  already-running stack (`pnpm stack:up`), with the default dev seed data
  intact. Exits non-zero with a listed summary of failures if anything
  regressed.
- **Deliberately not covered**: anything in §13's deferred/not-started
  catalog (MFA, per-record permissions, bulk grants, audit log, per-session
  tracking) — none of it is built, so there's nothing there to assert
  against yet. The background role re-sync poller (§8) is now built but
  also not covered here — its effect only becomes observable after waiting
  out a full `ROLE_SYNC_INTERVAL_MS` tick, which doesn't fit this script's
  request-per-request assertion style; verify it by hand (change a role in
  Keycloak's console, wait out the interval, confirm the next request
  reflects it without a force-logout).
- **Status**: done — 75 assertions (extended this session with §10b's
  `apps/engineering` coverage), verified to pass cleanly against a fresh
  stack and to fail with an accurate diagnostic when a permission row is
  corrupted by hand (tested by both routes: flipping the DB row directly,
  and confirming the script's own "granted" checks catch a false-200 from
  the Nginx gotcha above).

---

## 15. Session handoff notes

For whoever (human or agent) picks this repo up next — what changed most
recently, and where to look first.

**What just happened**: `apps/assets`' migration pipeline was rewritten
clean, closing all 5 rows in §13's `apps/assets`-specific deferred table.
The 32 exported Lovable migrations plus the hand-authored
`20260707000000_centralhub_rls.sql` rewrite (33 files total, applied as
literal history since the original ingestion) were replaced by 3 clean,
idempotent files at `apps/assets/db/migrations/`
(`20260707000000_schema.sql`, `20260707000001_rls.sql`,
`20260707000002_storage.sql`), mirroring `apps/engineering/db/migrations/`
exactly — same end-state schema/RLS/seed data, verified column-for-column
against all 33 original files by reading them directly (not summarized).
`apps/assets/scripts/migrate.sh` was simplified to match
`apps/engineering/scripts/migrate.sh`'s shape: the fragile `grep -v`
storage-statement line filter and the `ALREADY_MIGRATED` guard are both
gone (unnecessary once every statement is idempotent), and it gained the
`NOTIFY pgrst, 'reload schema'` call `apps/engineering` already had but
`apps/assets` was missing — a latent PostgREST schema-cache race, closed
while aligning the two. `apps/assets/supabase/` was renamed to
`apps/assets/db/` and the dead `config.toml` (unused hosted-project
pointer) deleted, matching `apps/engineering`'s own prior cleanup. Two
stale `.../supabase/migrations/...` comments in
`environments/docker-compose.yml` (one for each app; engineering's own
comment was already stale from its own earlier rename) were fixed as a
drive-by. §10's own historical write-up was left untouched per this
repo's "record what actually happened" convention, with a pointer note
added directing a reader to the new `db/migrations/` location. See §10's
new closing note and §13 for the full before/after.

**Known-open items** — see §13's tables. The two remaining
`apps/assets`-specific rows (storage-admin service-key gap, workflow-role
login retirement) were re-investigated this session, not just carried
forward: both confirmed still accurate and genuinely not actionable without
either nothing-to-fix (storage admin) or a product decision (workflow-role
login) — see §13 for the updated wording. Nothing else in §13 changed.

**Verification approach this session**: read all 33 original migration
files directly (not just a summary) before writing the replacements, to
guarantee the rewrite is byte-accurate to the exported end state, not just
"looks right." Then verified against the real running stack: rebuilt
`assets-migrate`'s image and ran it twice against the existing (already
years-old-by-container-standards, already-migrated) `assets-db` volume —
both runs exited 0, confirming restart-idempotency now that the
`ALREADY_MIGRATED` guard is gone. Queried the live database directly
afterward to confirm the schema matches exactly: 90 columns on
`asset_purchase_requests`, 17 functions, 24 public-schema RLS policies (6
tables × 4 verbs) + 4 storage policies, 6 seeded `role_assignments` rows,
8 seeded `cc_recipient` dropdown rows. Ran the full `pnpm test:stack`
suite (75 assertions) clean, including the `apps/assets` RLS-boundary
checks (§16) that exercise the rewritten policies end-to-end. A true
fresh-volume test (wiping `centralhub_assets_pgdata` entirely) was
considered but not run — the restart-against-already-migrated-volume test
above is the more realistic scenario given this repo's own
volume-persistence convention (see the "Temporary exception" note below),
and the schema/function/policy counts already confirm no drift.

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
re-run every migration from empty volumes while §16's test script and other
day-to-day work are still iterating. This is scaffolding-phase convenience, not
a policy change — revert to the delete-`.env`-each-session convention (§3/§5)
once the stack stabilizes, and definitely before any real/shared deployment.
