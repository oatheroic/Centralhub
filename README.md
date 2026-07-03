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
│   └── finance/                # Department app
├── services/
│   └── inference-gateway/     # Single internal API all apps call for LLM access.
│                               # Proxies to Claude today, swaps to a local model later.
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
relative URL. Cards render from this list; clicking one sets a same-origin,
non-sensitive mock session cookie (`chub_user`, `path=/`) and navigates to the app's
URL. Identity is passed via cookie rather than a URL query string deliberately —
query params leak into browser history, server logs, and `Referer` headers, while a
`path=/` cookie reaches every app behind the gateway (all same-origin) without any
of that exposure.

## Apps in this repo

| App | Package | URL | Purpose |
|---|---|---|---|
| `apps/_template` | `@apps/template` | `/apps/_template/` | Starting point to copy when scaffolding a new app; demonstrates calling `/api/inference/health`. |
| `apps/central-hub` | `@apps/central-hub` | `/` (gateway root) | Landing dashboard; discovers apps via `src/registry/apps.ts`, shows an identity banner, hands off a mock session via cookie on card click. |
| `apps/marketing` | `@apps/marketing` | `/apps/marketing/` | Placeholder department app; reads the `chub_user` handoff cookie set by central-hub and displays it. |
| `apps/finance` | `@apps/finance` | `/apps/finance/` | Same placeholder pattern as marketing, Finance department. |

This table is maintained by hand and documents the same set of apps as
`apps/central-hub/src/registry/apps.ts` — update both when adding or removing an app.

### Pillar 3 — Environment portability (`/environments`)
One `docker-compose.yml` ties the gateway, every app container, and the inference
gateway into a single bridge network, with all provider/API config supplied through
`environments/.env` (see `.env.example`). Nothing here depends on a cloud control
plane — `docker compose up` is the entire deployment story on any machine with Docker.

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
cp environments/.env.example environments/.env   # fill in ANTHROPIC_API_KEY
pnpm stack:up
# open http://localhost:8080/
```
