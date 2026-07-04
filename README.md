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
| — | Real per-app backends, production hardening | Not started (see §10) |

---

## 2. Architecture

```
CentralHub/
├── apps/                     # Isolated frontend micro-apps (React + Vite + TS + Tailwind)
│   ├── _template/             # Copy this to scaffold a new app
│   ├── central-hub/           # Landing dashboard, served at gateway root (/)
│   ├── marketing/              # Department app
│   ├── finance/                # Department app
│   └── admin/                  # User list + user × app permissions matrix editor,
│                                # gated by the admin realm role
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
| 4 — Authentication & RBAC | `keycloak/`, `services/auth-gateway/` | Real login, role gate, per-app permissions |

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
     table in §8 below.
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
  bfcache fix, SSO logout fix — see notes below).
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
    untouched.
- **Deferred / not built**: MFA, password reset flows, self-service
  registration (`registrationAllowed: false`), refresh-token rotation (session
  cookie is a flat 8h JWT, no silent renewal).

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
  - No bulk-grant UI (e.g. "grant all Marketing users read") — the admin
    panel edits one (user, app) cell at a time.
  - No audit log of who changed which permission when.

---

## 8. Apps in this repo

| App | Package | URL | Purpose |
|---|---|---|---|
| `apps/_template` | `@apps/template` | `/apps/_template/` | Starting point to copy when scaffolding a new app; demonstrates calling `/api/inference/health`. |
| `apps/central-hub` | `@apps/central-hub` | `/` (gateway root) | Landing dashboard; discovers apps via `src/registry/apps.ts`, shows the real logged-in user via `/auth/me`. |
| `apps/marketing` | `@apps/marketing` | `/apps/marketing/` | Placeholder department app; demo RBAC-guarded "Save campaign" action. |
| `apps/finance` | `@apps/finance` | `/apps/finance/` | Placeholder department app; demo RBAC-guarded "Approve budget" action. |
| `apps/admin` | `@apps/admin` | `/apps/admin/` | Keycloak user list + permissions matrix editor (§7). Not in the registry above — never linked in the UI — but that's a minor bonus, not the real protection: the `admin`-role Nginx gate is what actually stops access. |

This table is maintained by hand alongside `apps/central-hub/src/registry/apps.ts`
and `services/auth-gateway/src/permissions.ts`'s `KNOWN_APPS` — update all three
when adding or removing an app.

---

## 9. The inference swap

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

## 10. Deferred / not started (catalog)

Consolidated from the sections above, so it's checkable in one place:

| Item | Where it would live | Why deferred |
|---|---|---|
| MFA / password reset / self-registration | Keycloak realm config | Out of scope for a local dev foundational slice |
| Session refresh / silent renewal | `services/auth-gateway` | Flat 8h JWT is sufficient for current usage |
| Real mutating backend per app | each `apps/<name>` | No app has real data to mutate yet — demo actions are local state only |
| Server-side enforcement of write/edit/delete | app-specific backend, calling `/session/verify-permission` | Nothing to enforce until an app has a real endpoint |
| Per-record / field-level permissions | `app_permissions` table design | Current granularity is per (user, app) only |
| Bulk permission grants | `apps/admin` Permissions panel | One-cell-at-a-time editing was sufficient for the current user count |
| Audit log of permission changes | new table + admin UI | Not needed until multiple admins manage grants |
| Production-safe credentials | `keycloak/realm-export.json`, `.env` | `dev-admin`/`dev-user`/client secret are dev-only seed data — see §6, §7 |

---

## 11. Quickstart

```sh
pnpm install
cp environments/.env.example environments/.env
# fill in ANTHROPIC_API_KEY, POSTGRES_PASSWORD, KEYCLOAK_ADMIN_PASSWORD, AUTH_SESSION_SECRET
pnpm stack:up
# open http://localhost:8080/

# log in as dev-admin / devadmin123 for full access everywhere, including
# the /apps/admin/ permissions panel (§7)

# log in as dev-user / devuser123 to see RBAC in action: full access to
# Marketing, a friendly "Access denied" page on Finance and Admin, and a
# window.alert() if you try an action beyond your granted verbs
```
