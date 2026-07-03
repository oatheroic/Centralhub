# CentralHub — Enterprise App Factory

A local-first, decoupled monorepo for standing up an unbounded fleet of departmental
mini-apps behind a single Nginx gateway, with an inference layer that can be
repointed from cloud Claude to a local model (e.g. Ollama on an RTX 5080) via one
environment variable — no application code changes required.

## Architecture

```
CentralHub/
├── apps/                     # Isolated frontend micro-apps (React + Vite + TS + Tailwind)
│   ├── _template/             # Copy this to scaffold a new app
│   ├── central-hub/           # Landing dashboard, served at gateway root (/)
│   ├── marketing/              # Department app
│   ├── finance/                # Department app
│   └── admin/                  # Read-only user list, gated by the admin realm role
├── services/
│   ├── inference-gateway/     # Single internal API all apps call for LLM access.
│   │                           # Proxies to Claude today, swaps to a local model later.
│   └── auth-gateway/          # OIDC relying party for Keycloak; issues chub_session;
│                               # target of Nginx's auth_request gate.
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

### Pillar 1 — Workspace layout (`/apps`)
Each app is a fully self-contained pnpm workspace package: its own `package.json`,
`vite.config.ts`, `Dockerfile`, and source tree. Apps never import from one another.
Deleting or moving an app directory never breaks another app. `pnpm` deduplicates
`node_modules` across apps via its content-addressable store, so disk cost stays flat
as the fleet grows, without coupling app lifecycles together.

To add a new app: copy `apps/_template` to `apps/<name>`, rename the `package.json`
`name` field, set `base: "/apps/<name>/"` in `vite.config.ts`, add a service entry to
`environments/docker-compose.yml` (mirroring `app-template`), and add it to
`apps/central-hub/src/registry/apps.ts` so it appears as a dashboard card. **No Nginx
changes are needed** — see Pillar 2.

### Pillar 2 — Traffic gateway (`/gateway`)
An Nginx container is the single local entrypoint (`localhost:8080`). The gateway
root (`/`) proxies to `apps/central-hub`, the landing dashboard. Every other app is
routed by a single dynamic regex location — `/apps/<name>/<rest>` proxies to
`app-<name>:80/<rest>` — so adding a new app under `/apps/<name>/` never requires
editing `gateway/conf.d/default.conf`; only a matching `app-<name>` compose service
needs to exist. `/api/inference/` is routed separately to the inference gateway.
Apps are built as static assets and served by a tiny per-app Nginx image, so the
routing layer and the app runtime stay decoupled — the gateway only needs a
hostname, never app internals.

### Component discovery (`apps/central-hub/src/registry/apps.ts`)
The hub's dashboard is driven by a single static, file-based registry — no backend
call. Each entry maps an app's id, display name, department, icon, and gateway-
relative URL. Cards render from this list; clicking one just navigates to the app's
URL — no manual cookie handling needed, since the real session cookie (see Pillar 4)
is already sent automatically on any same-origin navigation.

## Apps in this repo

| App | Package | URL | Purpose |
|---|---|---|---|
| `apps/_template` | `@apps/template` | `/apps/_template/` | Starting point to copy when scaffolding a new app; demonstrates calling `/api/inference/health`. |
| `apps/central-hub` | `@apps/central-hub` | `/` (gateway root) | Landing dashboard; discovers apps via `src/registry/apps.ts`, shows the real logged-in user via `/auth/me`. |
| `apps/marketing` | `@apps/marketing` | `/apps/marketing/` | Placeholder department app; displays the logged-in user via `/auth/me`. |
| `apps/finance` | `@apps/finance` | `/apps/finance/` | Same placeholder pattern as marketing, Finance department. |
| `apps/admin` | `@apps/admin` | `/apps/admin/` | Read-only list of Keycloak users. Intentionally excluded from the registry above — never linked in the UI — but that's a minor bonus, not the real protection: it's gated by the `admin` realm role at the Nginx layer (see Pillar 4), so a discovered URL still 401/403s without valid admin credentials. |

This table is maintained by hand and documents the same set of apps as
`apps/central-hub/src/registry/apps.ts` — update both when adding or removing an app.

### Pillar 3 — Environment portability (`/environments`)
One `docker-compose.yml` ties the gateway, every app container, and the inference
gateway into a single bridge network, with all provider/API config supplied through
`environments/.env` (see `.env.example`). Nothing here depends on a cloud control
plane — `docker compose up` is the entire deployment story on any machine with Docker.

### Pillar 4 — Authentication (`/keycloak`, `services/auth-gateway`)
Every app requires a real login — there is no mock session anymore. A self-hosted
[Keycloak](https://www.keycloak.org/) identity provider (Postgres-backed) handles
credentials and issues OIDC tokens; `services/auth-gateway` is the confidential OIDC
client that terminates the login flow server-side and issues CentralHub's own signed
session cookie (`chub_session`, HttpOnly). Nginx gates every app behind
`auth_request /internal/verify` — anyone without a valid session is redirected to
`/auth/login`. `/apps/admin/` additionally requires an `admin` realm role
(`/internal/verify-admin`); everything else just requires being logged in. Fine-
grained per-app read/write/edit/delete permissions are **not** built yet — this is a
foundational slice, deliberately scoped to authentication + a coarse role gate.

**Local dev logins** (seeded by `keycloak/realm-export.json`, never for production):
- `dev-admin` / `devadmin123` — has the `admin` role, can reach `/apps/admin/`.
- `dev-user` / `devuser123` — `user` role only, gets 403 on `/apps/admin/`.

Keycloak is **not** proxied through the main gateway — it publishes its own port
(`KEYCLOAK_PORT`, default `8081`) directly, since reverse-proxying Keycloak under an
Nginx path prefix is a well-known operational pain point. It's reached at two
different hostnames (`localhost:8081` from the browser, `keycloak:8080` container-to-
container from `auth-gateway`); `KC_HOSTNAME`/`_PORT`/`_STRICT` in
`environments/docker-compose.yml` pin a single issuer regardless of which path served
a given request — without this, token issuer verification would break depending on
whether Keycloak was reached via the published port or the internal Docker DNS name.

Logout ends both CentralHub's own session **and** Keycloak's browser SSO session
(via Keycloak's end-session endpoint) — clearing only the local cookie would leave
Keycloak's SSO cookie alive, so the very next login would silently re-authenticate
with no credential prompt. The `/auth/logout` route shows a brief confirmation page
before continuing, since a raw redirect chain through Keycloak and back has no
visual continuity otherwise. Every app-serving Nginx location also sends
`Cache-Control: no-store` — without it, a browser can restore a fully-rendered,
previously-authenticated page from its back/forward cache on navigation with no
network request at all, meaning the auth gate never gets a chance to re-fire.

The login page itself uses a custom Keycloak theme (`keycloak/themes/centralhub/`) —
a CSS-only override layered on top of Keycloak's own base theme via
`theme.properties`, so nothing about the form's structure or behavior changes, only
its appearance.

### The inference swap
Apps never call Anthropic (or any provider) directly. They call
`POST /api/inference/v1/chat` on the gateway. `services/inference-gateway` reads
`INFERENCE_PROVIDER` (`claude` | `local`) and dispatches to the matching provider
module. To move to a local model on the RTX 5080 (e.g. via Ollama), set
`INFERENCE_PROVIDER=local` and `LOCAL_MODEL_BASE_URL` in `environments/.env` —
no app or gateway code changes.

## Quickstart

```sh
pnpm install
cp environments/.env.example environments/.env
# fill in ANTHROPIC_API_KEY, POSTGRES_PASSWORD, KEYCLOAK_ADMIN_PASSWORD, AUTH_SESSION_SECRET
pnpm stack:up
# open http://localhost:8080/ — log in as dev-admin / devadmin123 (see Pillar 4)
```
