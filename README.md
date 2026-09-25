# CentralHub — Enterprise App Factory

A local-first, decoupled monorepo for standing up an unbounded fleet of
departmental mini-apps behind a single Nginx gateway, with a swappable LLM
inference layer and real authentication + role-based access control.

**Adding a department app, or moving inference from cloud Claude to a local
model, should each be a small, mechanical, well-documented change — never a
rearchitecture.** Everything below exists to keep that true.

---

## Documentation

This README carries only what you need to get oriented and running. Everything
else lives in [`docs/`](docs/).

> **Section numbers (§N) are stable IDs.** 41 source files cite them in
> comments (`see §7`, `per §10d`). They are never renumbered — only moved
> between files. The table below is the map from §N to where it now lives.

| Read this when you want to… | Document | Sections |
|---|---|---|
| **Decode the vocabulary** ("admin" and "role" each mean several things) | [docs/glossary.md](docs/glossary.md) | — |
| Understand how the pieces fit together, the data model, the service map | [docs/architecture.md](docs/architecture.md) | §2-§5 |
| Work on login, permissions, admin roles, or revocation | [docs/auth-and-rbac.md](docs/auth-and-rbac.md) | §6-§8 |
| Decide how a new app enforces access | [auth-and-rbac.md § *Choosing an enforcement model*](docs/auth-and-rbac.md#choosing-an-enforcement-model-native-gate-vs-minted-jwtrls) | §7 |
| Touch the design system or an app shell | [docs/ui.md](docs/ui.md) | §9 |
| Swap the LLM, or change how apps register themselves | [docs/app-registry.md](docs/app-registry.md) | §12, §12b |
| Add or consume platform notifications | [docs/notifications.md](docs/notifications.md) | §16 |
| Run or extend the test suites | [docs/testing.md](docs/testing.md) | §15, §14b |
| Check what is consciously unfinished | [docs/deferred.md](docs/deferred.md) | §13 |

**Playbooks** — the procedures, distilled from having done them:

| Task | Playbook | Sections |
|---|---|---|
| Scaffold a **new first-party** app | [docs/architecture.md](docs/architecture.md#how-to-add-a-new-app) | §3 |
| Onboard a new externally-built app | [docs/playbooks/ingest-third-party-app.md](docs/playbooks/ingest-third-party-app.md) | §10c |
| Merge a fresh export of an app already here | [docs/playbooks/update-ingested-app.md](docs/playbooks/update-ingested-app.md) | §10d |
| Give an app a real mutating backend | [docs/playbooks/backends.md](docs/playbooks/backends.md) | §10e, §10f |
| **Add to or reorganise these docs** | [docs/playbooks/maintaining-docs.md](docs/playbooks/maintaining-docs.md) | — |

**History** — what each pass actually did, kept for the reasoning rather than
as instructions. Reach for a playbook first; come here when you need to know
*why* something is the way it is:

| Record | Document | Sections |
|---|---|---|
| The first ingestion, warts and all | [docs/history/assets-ingestion.md](docs/history/assets-ingestion.md) | §10 |
| The second, plus its update and hardening runs | [docs/history/engineering-ingestion.md](docs/history/engineering-ingestion.md) | §10b, §10g |
| Session-by-session handoffs, newest first | [docs/history/session-handoffs.md](docs/history/session-handoffs.md) | §17 |

**Start here if you are new:** [Quickstart](#14-quickstart) below, then
[docs/architecture.md](docs/architecture.md).

**Start here if you are an agent:** [CLAUDE.md](CLAUDE.md).

---

## 14. Quickstart

> **`environments/.env` is gitignored and will not be present on a fresh
> clone.** That is expected, not a broken checkout — recreate it from
> `.env.example` as below. The repo's convention is to delete it (and tear
> down volumes) at the end of a working session; a dev-period exception
> leaving both in place has been in force for several sessions, so on a
> machine that has run the stack before, both may already exist and be
> current. Check before assuming either way.


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

# to walk the engineering repair workflow end to end (§10g's seeded test
# cast, one browser profile per user): dev-user4 / devuser4123 files a
# job (reporter), dev-user5 / devuser5123 assigns it (leader),
# dev-user / devuser123 works and closes it (repairer), dev-user4 reviews
# it; dev-admin sees the audit log and the role/routing panel

# to see instant revocation (§8): while dev-user has an active session in
# another browser/tab, click "Revoke session" next to them in
# /apps/admin/'s user list as dev-admin — their very next request anywhere
# gets a 403, no waiting for the 8h session to expire
```

---
---

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
| — | Real per-app backends, production hardening | Backend factory done (§10f: `services/_template` + `@centralhub/service-kit`, zero-edit `/apps/<id>/api/` routing) with `apps/resource-booking` (§10e) as the reference; production hardening not started (see §13) |

---
---

## 11. Apps in this repo

| App | Package | URL | Purpose |
|---|---|---|---|
| `apps/_template` | `@apps/template` | `/apps/_template/` | Starting point to copy when scaffolding a new app; demonstrates calling `/api/inference/health`. |
| `apps/central-hub` | `@apps/central-hub` | `/` (gateway root) | Landing dashboard; discovers apps via `GET /auth/apps` (§12b's dynamic registry), shows the real logged-in user via `/auth/me`. |
| `apps/marketing` | `@apps/marketing` | `/apps/marketing/` | Placeholder department app; demo RBAC-guarded "Save campaign" action. |
| `apps/finance` | `@apps/finance` | `/apps/finance/` | Placeholder department app; demo RBAC-guarded "Approve budget" action. |
| `apps/admin` | `@apps/admin` | `/apps/admin/` | Keycloak user list (with a per-user "Revoke session" action, §8, now confirm-gated, §9) + permissions matrix editor (§7). Linked from `central-hub`'s landing grid only for users holding the `admin` role (§9) — that's a discoverability nicety, not the real protection: the `admin`-role Nginx gate is what actually stops access. |
| `apps/assets` | `@apps/assets` | `/apps/assets/` | First third-party/self-hosted app (§10) — asset purchase requests, registration, transfers; its own Postgres/PostgREST/storage-api, no external SaaS dependency. |
| `apps/engineering` | `@apps/engineering` | `/apps/engineering/` | Second third-party/self-hosted app (§10b) — machine repair job workflow (report/schedule/assign/repair/review); its own Postgres/PostgREST/storage-api, no external SaaS dependency. First app to receive a post-ingestion Lovable update (§10d, 2026-09-15). |
| `apps/resource-booking` | `@apps/resource-booking` | `/apps/resource-booking/` | First-party app (§10e) — room booking; the first app in this repo with a real mutating backend (`services/booking-api`, compose `api-resource-booking`), using the native permission gate (§7) via `@centralhub/service-kit` (§10f) instead of minted-JWT/RLS. Admin-override cancels notify the owner. |

This table itself is still maintained by hand (it's prose, not the registry) —
but the dashboard entry, permission-matrix participation, and admin role-code
guarantee it used to require three separate file edits for are now sourced
live from auth-gateway's `apps` table; see §12b.

---
---

## Conventions worth knowing before you edit

- **§N section numbers are stable IDs, not an ordering.** Source comments cite
  them. Never renumber; if you move a section, update the map above.
  The full procedure for editing these docs — where new content belongs, the
  handoff format, how to sweep for staleness — is
  [docs/playbooks/maintaining-docs.md](docs/playbooks/maintaining-docs.md).
- **Comments explain *why*, not *what*.** The density of rationale in this
  codebase is deliberate — most non-obvious lines exist because something
  failed in live testing, and the comment records that finding so it is not
  rediscovered. Match it.
- **Verify against the running stack, not just a typecheck.** Nearly every
  subtle bug in this repo's history was found by `scripts/test-stack.mjs` or
  by hand in a browser, not by the compiler. See
  [docs/testing.md](docs/testing.md).
- **Migrations are idempotent and re-run on every container start.** Write
  them so that is safe (`IF NOT EXISTS` / `OR REPLACE` / `DROP POLICY
  IF EXISTS` + `CREATE` / `ON CONFLICT`), and add new files to the app's own
  `scripts/migrate.sh`, which lists them explicitly rather than globbing.
- **Fail closed.** Every auth path in this repo treats an error as a denial.
  Keep it that way.
