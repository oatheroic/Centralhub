# CentralHub — notes for agents

A local-first monorepo of departmental mini-apps behind one Nginx gateway,
with Keycloak auth and per-app RBAC. Read [README.md](README.md) first for
the map; this file is the working context that isn't obvious from the code.

## Commands

```sh
pnpm install
pnpm stack:up            # docker compose up --build (the whole stack)
pnpm stack:down
pnpm stack:logs
pnpm test:stack          # end-to-end against a RUNNING stack — the real gate
pnpm test:unit           # vitest, service-kit only
pnpm build               # pnpm -r build
```

Dev logins: `dev-admin`/`devadmin123` (Keycloak realm admin, so admin
everywhere), `dev-user`/`devuser123`, `dev-user2..5`/`devuserN123`.
Gateway on `http://localhost:8080`, Keycloak on `:8081`.

`environments/.env` is gitignored, so a fresh clone has none — recreate it
from `environments/.env.example`. On a machine that has run the stack before
it is probably already there and current (see the Quickstart note in the
README). `pnpm stack:up` takes a few minutes on a cold build; Keycloak is the
slow one, and auth-gateway retries its seeding for ~90s while it waits, so
"Keycloak not ready for seeding yet" in the logs is normal, not an error.

## Where things live

Docs are split by task — see the table in [README.md](README.md#documentation).

**Read [docs/glossary.md](docs/glossary.md) first.** "admin" means four
different things here (platform admin / local admin / the `is_admin` claim /
the `apps/admin` app) and "role" means four more. Most confusion in this repo
traces back to conflating them.

After that: [docs/auth-and-rbac.md](docs/auth-and-rbac.md) for anything
access-related, [docs/architecture.md](docs/architecture.md) for the data
model and service map, [docs/playbooks/](docs/playbooks/) for procedures.

## Conventions

- **Before editing any documentation, read
  [docs/playbooks/maintaining-docs.md](docs/playbooks/maintaining-docs.md).**
  It covers where new content belongs (reference vs. playbook vs. history),
  the session-handoff format, the house style, and the checks to run before
  you finish.
- **`§N` section numbers are stable IDs.** 41 source files cite them in
  comments. Never renumber; if you move a section between doc files, update
  the map in the README.
- **Append a handoff entry** to the top of
  `docs/history/session-handoffs.md` for any substantive session, and add a
  row to `docs/deferred.md` for anything you consciously leave undone.
- **Comments explain *why*.** Most non-obvious lines exist because something
  failed in live testing; the comment records the finding so it isn't
  rediscovered. Match that density — it is deliberate, not noise.
- **Fail closed.** Every auth path treats an error as a denial.
- **Migrations re-run on every container start**, so every statement must be
  idempotent (`IF NOT EXISTS` / `OR REPLACE` / `DROP POLICY IF EXISTS` +
  `CREATE` / `ON CONFLICT`). Each app's `scripts/migrate.sh` lists its files
  **explicitly** — a new migration that isn't added there silently never runs.
- **Verify against the running stack.** A typecheck proves very little here;
  `pnpm test:stack` and a browser have caught nearly every real bug.

## Environment gotchas

These cost time if you rediscover them:

- **Windows + Git Bash.** `docker exec` mangles container paths unless you
  prefix `MSYS_NO_PATHCONV=1`. Heredocs into `docker exec psql` are
  unreliable — write the SQL to a file, `docker cp`, then `psql -f`.
- **The central Postgres is `-U keycloak -d keycloak`** (it backs Keycloak and
  auth-gateway both). The app databases are `-U assets -d assets` and
  `-U engineering -d engineering`.
- **`pnpm lint` fails repo-wide for reasons unrelated to your change.**
  `auth-gateway` and `service-kit` have no `eslint.config.js` at all (ESLint 9
  requires one); `apps/assets` carries ~6,200 pre-existing errors from its
  Lovable export. Lint the specific file you touched, not the package, and
  don't mass-`--fix` exported code — it buries the real diff.
- **Frontend changes need a container rebuild to be visible**
  (`docker compose ... up --build -d app-<name>`); the apps are static builds
  served by Nginx, not dev servers.

## Testing pattern that works well here

`scripts/test-stack.mjs` drives the real Keycloak Authorization Code flow with
a cookie jar. For a targeted check, reuse its first ~246 lines (helpers +
`keycloakLogin`) and append your own assertions — much faster than
reimplementing login, and it exercises the same path a browser does.

If a test mutates seed state (permissions, attributes, overrides), restore it
afterwards and say so — the seeded baseline is documented in
`services/auth-gateway/src/permissions.ts`'s `seedDevPermissions()` and
`attributes.ts`'s `seedDevAttributes()`.
