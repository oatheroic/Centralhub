# Architecture and the first three pillars

How the pieces fit together: the decoupled layout, the Nginx gateway that fronts every app, and how the whole stack moves between machines.

> Part of the [CentralHub documentation](../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

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
│   │                             # database or a cloud dependency; archive/ holds dated
│   │                             # snapshots of the raw export for future diffing (§10c/§10d)
│   ├── engineering/              # Second third-party app (§10b) — Lovable export with
│   │                              # real Supabase Auth + real RLS (unlike assets' USING
│   │                              # (true) gap), now CentralHub-gated the same way, with
│   │                              # its own self-hosted Postgres/PostgREST/storage-api
│   │                              # (engineering-db, postgrest-engineering,
│   │                              # storage-engineering); archive/ holds dated snapshots
│   │                              # of the raw export for future diffing (§10c/§10d)
│   └── resource-booking/         # First-party app (§10e) — room booking, the first app
│                                  # in this repo with a real mutating backend; its own
│                                  # dedicated Postgres (booking-db) but no PostgREST/
│                                  # storage-api — uses the native permission gate (§7)
│                                  # instead of minted-JWT/RLS, since it's trusted
│                                  # first-party code, not a third-party export
├── packages/
│   ├── ui/                    # Shared design tokens, Tailwind preset, and React
│   │                            # primitives (§9) — consumed via workspace:*
│   └── service-kit/           # Shared Node library for first-party app backends (§10f):
│                                # one-call auth middleware (authenticate/requireVerb/
│                                # hasVerb), Pool + retry + tracked migrations, notify(),
│                                # health route. Built to dist/ (Node runtime, unlike ui).
├── services/
│   ├── _template/             # Copy this to scaffold a new app backend (§10f) — uses
│   │                           # service-kit; header comment carries the checklist
│   ├── inference-gateway/     # Single internal API all apps call for LLM access.
│   │                           # Proxies to Claude today, swaps to a local model later.
│   ├── auth-gateway/          # OIDC relying party for Keycloak; issues chub_session;
│   │                           # target of Nginx's auth_request gate; also owns the
│   │                           # app_permissions table (per-app read/write/edit/delete).
│   └── booking-api/           # apps/resource-booking's own backend (§10e) — Express +
│                                # its own Postgres; the reference consumer of
│                                # service-kit (§10f). Compose service: api-resource-booking.
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

---

## 3. Pillar 1 — Workspace layout (`/apps`)

- **Objective**: adding, moving, or deleting one app must never affect another.
- **Architecture**: each app is a fully self-contained pnpm workspace package —
  own `package.json`, `vite.config.ts`, `Dockerfile`, source tree. Apps never
  import from one another; small shared logic (e.g. `usePermissions.ts`) is
  duplicated per app on purpose, not centralized. `pnpm`'s content-addressable
  store deduplicates `node_modules` across apps regardless.
- **Status**: done, stable since Phase 1.
### How to add a new app

1. Copy `apps/_template` to `apps/<name>`.
2. Rename the `package.json` `name` field; set `base: "/apps/<name>/"` in
   `vite.config.ts`.
3. Add a service entry to `environments/docker-compose.yml` (mirror `app-template`).
4. Copy `app.manifest.json.example` to `app.manifest.json` and fill in
   `name`/`department`/`icon`/`description` — the next `pnpm stack:up`
   registers it automatically — dashboard card, plus permission-matrix
   participation — via auth-gateway's `apps` table, no file edit needed.
   See [app-registry.md](app-registry.md) (§12b) for the full mechanism, and
   `apps/admin`'s "Apps" tab to edit/hide/override a row afterward. Two
   fields are deliberately *not* manifest-settable because they affect real
   authorization: `known_app` and `admin_role_code`.
5. Copy in `usePermissions.ts` if it needs RBAC (§7). There is no
   longer any app list to edit by hand — step 4's manifest covers it.
6. **If it needs a real backend** (mutations, its own data): copy
   `services/_template` to `services/<name>` and follow the checklist in
   its `src/index.ts` header — set `APP_ID`, add a `<name>-db` and an
   `api-<name>` compose service (the name and port 4200 are the routing
   convention), add `<NAME>_DB_PASSWORD` to `.env.example`. See §10f.
**No Nginx changes are needed for any of the above** — see Pillar 2. That
now includes backends: `/apps/<name>/api/*` routes to `api-<name>:4200` by
convention.

---

---

## 4. Pillar 2 — Traffic gateway (`/gateway`)

- **Objective**: routing a new app should require zero Nginx edits.
- **Architecture**: Nginx is the single local entrypoint (`localhost:8080`).
  Root (`/`) proxies to `apps/central-hub`. Every other app is routed by one
  dynamic regex location — `/apps/<name>/<rest>` → `app-<name>:80/<rest>` — so
  a new app only needs a matching `app-<name>` compose service to exist.
  Since §10f the same is true for backends: a second regex location,
  `/apps/<name>/api/<rest>` → `api-<name>:4200/<rest>`, sits between the
  admin block and the frontend block, so a first-party API is reachable
  with zero Nginx edits as long as its compose service follows the
  `api-<name>` / port-4200 convention. API paths answer with bare
  401/403 (no HTML login redirect, which `fetch()` would follow into an
  unparseable 200) and a bare 502 when no such container exists — the same
  policy as `/api/inference/`. The third-party data-API blocks
  (`assets`/`engineering`, §10) keep their own `^~` blocks: they proxy to
  PostgREST/storage-api with different sub-paths and bearer forwarding.
  `/api/inference/` is routed separately. Apps are static assets served by a
  tiny per-app Nginx image, keeping routing decoupled from app internals.
- **Status**: done, stable since Phase 1; extended in Phase 4 with the
  per-app permission gate (§7).
- **Component discovery**: the dashboard's card list (id, name, department,
  icon, description) is fetched once from auth-gateway's `GET /auth/apps`
  (see §13's dynamic app registry) rather than a static file — a real,
  intentional change from earlier phases' "no backend call" dashboard,
  shown with a brief skeleton grid while it loads. Clicking a card still
  just navigates by convention (`id === "central-hub" ? "/" :
  "/apps/<id>/"`); the real session cookie (§6) travels automatically on
  same-origin nav.

---

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

---

---

## Data model at a glance

Every table below lives in the **central** Postgres (`db`, connect with
`-U keycloak -d keycloak` — it backs Keycloak too) and is created idempotently
by `services/auth-gateway/src/db.ts` on boot. Each app's *own* data lives in
its own database (`assets-db`, `engineering-db`, `booking-db`), never here.

| Table | Holds | Written by | Detail |
|---|---|---|---|
| `apps` | The app registry: name, icon, department, `hidden`, `requires_role`, `known_app`, `admin_role_code`, `source` | Manifest sync (safe fields) + `apps/admin`'s Apps tab (security fields) | [app-registry.md](app-registry.md) §12b |
| `app_permissions` | The four verbs per (user, app) | `apps/admin`'s Permissions tab | [auth-and-rbac.md](auth-and-rbac.md) §7 |
| `user_attributes` | `department` / `position` / `job_level` per user | `apps/admin`'s Users tab | §7 |
| `attribute_values` | The managed vocabulary those attributes draw from | `apps/admin` | §7 |
| `app_role_rules` | Bulk attribute→`role_code` mappings, per app | Each app's own role panel, or a platform admin | §7, [glossary](glossary.md#role-rules-vs-role-overrides) |
| `app_role_overrides` | Named user→`role_code` exceptions, per app. The only way to grant admin | Same | §7 |
| `user_roles` | Mirror of Keycloak realm roles, refreshed at login and by a 60s poller | `syncRolesFromKeycloak()` | [auth-and-rbac.md](auth-and-rbac.md) §8 |
| `session_revocations` | Per-user cutoff timestamp for instant logout | `apps/admin`'s Revoke button, backchannel logout | §8 |
| `audit_log` | Append-only history of admin actions and role syncs | `recordAudit()` everywhere | §7 |
| `notifications` | One row per recipient, including fanned-out announcements | auth-gateway and `service-kit`'s `notify()` | [notifications.md](notifications.md) §16 |

## Services at a glance

26 compose services, but only two patterns worth memorising.

**Published to the host** — everything else is internal to the compose network:

| Port | Service |
|---|---|
| `8080` | `gateway` (Nginx) — the single entrypoint |
| `8081` | `keycloak` |

**Naming conventions that the routing depends on** (get these wrong and
nothing resolves):

| Pattern | Meaning |
|---|---|
| `app-<id>` | A static Vite build served by Nginx. Reached at `/apps/<id>/`. |
| `api-<id>` listening on **4200** | That app's backend. The gateway's generic `/apps/<id>/api/` location resolves `api-<id>:4200` — **no Nginx edit needed**, but the name and port are mandatory. |
| `<id>-db` | That app's own Postgres. |
| `postgrest-<id>` / `storage-<id>` | The data layer for a minted-JWT/RLS app. |
| `<id>-migrate` | One-shot migration runner; exits 0 when done. |

Platform services: `auth-gateway` (:4100, all auth and admin APIs),
`inference-gateway` (the swappable LLM backend), `apps-manifest-sync`
(one-shot, registers apps at start), `db` (central Postgres).

Because frontends are **static builds**, editing app source changes nothing
until you rebuild that container:
`docker compose -f environments/docker-compose.yml up --build -d app-<id>`.
