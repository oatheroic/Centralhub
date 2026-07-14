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
│   └── assets/                  # First third-party app (§10) — Lovable export, now a
│                                  # static SPA with its own self-hosted Postgres/
│                                  # PostgREST/storage-api (assets-db, postgrest-assets,
│                                  # storage-assets in docker-compose.yml), not a shared
│                                  # database or a cloud dependency
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
into two tables: everything specific to `apps/assets` (§10), then everything
else.

**`apps/assets`-specific**:

| Item | Where it would live | Why deferred |
|---|---|---|
| `storage-assets` bucket-metadata admin calls | `apps/assets` self-hosted storage layer (§10) | Needs the service key, not a per-user JWT — object upload/download (what the app actually uses) is unaffected. Currently dormant: no code in `apps/assets` calls a bucket-metadata admin endpoint (the bucket is created once via SQL migration, not at runtime), so there's nothing live to break yet |
| `apps/assets`'s workflow-role login can't be fully retired | `apps/assets` `role_assignments`/`LoginForm` | The identity→role_code mapping (§10) makes it optional, not obsolete — any user with no matching `app_role_rules` row still needs it; a hypothetical "100% coverage, no fallback" mode isn't built, and retiring it is a data-completeness question, not a code change |

**General**:

| Item | Where it would live | Why deferred |
|---|---|---|
| MFA / password reset / self-registration | Keycloak realm config | Out of scope for a local dev foundational slice |
| Real mutating backend per app | each `apps/<name>` | No app has real data to mutate yet — demo actions are local state only |
| Server-side enforcement of write/edit/delete | app-specific backend, calling `/session/verify-permission` | Nothing to enforce until an app has a real endpoint |
| Per-record / field-level permissions | `app_permissions` table design | Current granularity is per (user, app) only |
| Bulk permission grants | `apps/admin` Permissions panel | One-cell-at-a-time editing was sufficient for the current user count — in progress, see §7 |
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
# ASSETS_STORAGE_ANON_KEY, ASSETS_STORAGE_SERVICE_KEY — the last two are
# HS256 JWTs signed with PGRST_JWT_SECRET, see .env.example's own comments
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
  `write:false` → `403` on INSERT, then restoring it), instant session
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
- **Status**: done — 65 assertions, verified to pass cleanly against a fresh
  stack and to fail with an accurate diagnostic when a permission row is
  corrupted by hand (tested by both routes: flipping the DB row directly,
  and confirming the script's own "granted" checks catch a false-200 from
  the Nginx gotcha above).

---

## 15. Session handoff notes

For whoever (human or agent) picks this repo up next — what changed most
recently, and where to look first.

**What just happened**: a focused session restyling the Keycloak login page
only — `keycloak/themes/centralhub/login/resources/css/centralhub.css`,
CSS-only, no other file touched. Full account in §6's login-theme bullet;
short version:
1. Replaced the theme's original standalone pastel-pink/glassy look with
   the same dark indigo/slate palette `packages/ui/tokens.css` uses
   everywhere else, plus a responsive card width, field icons, a
   "CentralHub" masthead + generated sub-header, and layered shadows for
   depth against a flat dark gradient page background.
2. Fixed two structural bugs introduced mid-session, both from
   over-broad CSS selectors matching more of Keycloak's base-theme DOM
   than intended: a card-nested-inside-a-card (two different elements both
   getting "the card" styling) and a flex-row masthead sitting beside the
   card instead of stacked above it.
3. Fixed field icons disappearing under browser autofill: they were
   `background-image` on the `<input>` itself, which Chrome/Edge/Safari's
   autofill silently overwrites. Moved to a `::before` on the `.form-group`
   wrapper (via `:has()`) instead — a plain div, never autofilled — and
   added the standard `:-webkit-autofill` inset-`box-shadow` trick to
   neutralize the blue/yellow autofill tint too.

**How this was actually verified**: no chromium-cli/Playwright was
preinstalled for this repo, so a throwaway Playwright + headless Chromium
was installed into the scratch temp dir (not `package.json` — nothing
added to the repo's own dependencies) to screenshot the real rendered page
end-to-end against the live `docker compose` stack (Keycloak's theme
directory is bind-mounted read-only and served uncached under
`start-dev`, so no container restart is needed between edits — confirmed
by diffing the live-served CSS against the file on disk). Screenshots at
desktop + mobile viewports, a simulated autofilled-background state, and
computed-style/DOM inspection (`page.$eval`) is what actually caught the
double-card and flex-row bugs above — they were invisible from reading the
CSS alone, since every individual selector "looked" reasonable in
isolation.

**Local dev credentials** (all dev-only, seeded automatically on
`docker compose up`, safe to commit): Keycloak login `dev-admin`/
`devadmin123` (admin realm role) and `dev-user`/`devuser123`. `apps/assets`'s
own role-picker fallback login (only seen if the identity mapping doesn't
resolve): `ADM01`/`123456` (full access), or `REQ01`/`APP01`/`AST01`/
`PUR01`/`ACC01` with the same password for narrower roles.

**Known-open items** are unchanged from before this session — see §13's
two tables (`apps/assets`-specific and general); nothing in this session
closed or opened an item there.

**One thing this session did differently — worth calling out for whoever's
next**: this was a CSS-only theme, so there was no image to rebuild —
Keycloak's theme directory is bind-mounted (`environments/docker-compose.yml`)
and served uncached under `start-dev`, so every edit was verified live
against the running stack on the next request, no `docker compose build`/
`restart` in the loop at all. Several rounds of user feedback (icon
invisible under autofill, double-card layout, masthead floating beside
instead of above the card) only surfaced from actual rendered screenshots,
not from re-reading the CSS — the same "verify visually, not just
typecheck-clean" lesson prior sessions in this log already learned for
app UI work, now confirmed to apply to the Keycloak theme too.

**Git/environment state as of this handoff**: the CSS change described
above is uncommitted as of this note being written — commit it alongside
this README update in one commit (see the commit this paragraph ships in).
`environments/.env` is gitignored and deleted at the end of each session
per this repo's own convention (see §3/§5) — regenerate it from
`.env.example` following §14's Quickstart before bringing the stack back
up.

**Temporary exception (dev period only)**: as of this handoff, `environments/.env`
and the stack's Docker volumes (`centralhub_pgdata`, `centralhub_assets_pgdata`,
`centralhub_assets_storage`) are being left in place across sessions instead of
being torn down, so `pnpm stack:up`/`down` don't repeatedly rebuild Postgres and
re-run every migration from empty volumes while §16's test script and other
day-to-day work are still iterating. This is scaffolding-phase convenience, not
a policy change — revert to the delete-`.env`-each-session convention (§3/§5)
once the stack stabilizes, and definitely before any real/shared deployment.
