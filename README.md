# CentralHub — Enterprise App Factory

A local-first, decoupled monorepo for standing up an unbounded fleet of departmental
mini-apps behind a single Nginx gateway, with an inference layer that can be
repointed from cloud Claude to a local model (e.g. Ollama on an RTX 5080) via one
environment variable — no application code changes required.

## Architecture

```
CentralHub/
├── apps/                     # Isolated frontend micro-apps (React + Vite + TS + Tailwind)
│   └── _template/             # Copy this to scaffold a new app
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
`name` field, set `base: "/apps/<name>/"` in `vite.config.ts`, and add a matching
`location /apps/<name>/` block + service entry in `gateway/` and
`environments/docker-compose.yml`.

### Pillar 2 — Traffic gateway (`/gateway`)
An Nginx container is the single local entrypoint (`localhost:8080`). It path-routes
to each app's own container by service name (`/apps/<name>/ → app-<name>:80`) and to
the inference gateway (`/api/inference/ → inference-gateway:4000`). Apps are built as
static assets and served by a tiny per-app Nginx image, so the routing layer and the
app runtime stay decoupled — the gateway only needs a hostname, never app internals.

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
# open http://localhost:8080/apps/_template/
```
