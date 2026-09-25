# Inference swap and the dynamic app registry

Swapping the LLM backend, and how apps register themselves instead of being hand-listed.

> Part of the [CentralHub documentation](../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

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

---

## 12b. Dynamic app registry

- **Objective**: registering a new app (or editing an existing one's
  dashboard metadata) shouldn't require hand-editing three independent,
  drift-prone lists — `apps/central-hub/src/registry/apps.ts`'s static
  array, `services/auth-gateway/src/permissions.ts`'s `KNOWN_APPS`
  constant, and `attributes.ts`'s `CENTRALHUB_ADMIN_ROLE_CODE` map — every
  time. This was §13's longest-standing deferred item; closed for the
  touchpoints that are genuinely *metadata*, not infrastructure.
- **Architecture**: a new `apps` table in auth-gateway's Postgres (see
  `db.ts`) is now the single source of truth. Each app folder can carry an
  `app.manifest.json` (`name`/`department`/`icon`/`description`/`hidden`/
  `requiresRole`) — a new one-shot `apps-manifest-sync` compose service
  (`scripts/sync-app-manifests.mjs`) reads every `apps/*/app.manifest.json`
  on each `docker compose up` and registers it via
  `POST /internal/apps/sync` (server-to-server only, same posture as
  `/backchannel-logout`), **insert-if-absent only** — it never overwrites a
  row an admin has since edited, the same "don't fight an admin's own
  change" rule §8's `seedRoleRulesIfEmpty()` already established. Only
  `central-hub` and `admin` are pre-seeded manually in `db.ts` (both are
  platform-internal, never a "real" app someone deploys via the manifest
  flow); `marketing`/`finance`/`assets`/`engineering` register themselves
  via their own manifests, so their `source` column correctly reads
  `manifest`, not `manual`. `apps/central-hub`'s dashboard now fetches
  `GET /auth/apps` instead of importing a static array (a real, intentional
  change from the earlier "no backend call" dashboard — see §4); `apps/admin`
  gained an "Apps" tab for full CRUD, with a visual icon picker (a curated
  Lucide icon grid, `IconPicker.tsx`) instead of a free-text icon-name
  field, a per-row reachability check, and flag badges (hidden/role/
  admin-role/not-permission-gated/source) each given their own tone rather
  than uniform gray, so a scan of the table reads at a glance.
- **Security boundary**: a manifest can only set cosmetic/discovery fields.
  `known_app` (permission-matrix participation, ex-`KNOWN_APPS`) and
  `admin_role_code` (the "guaranteed CentralHub admin" override,
  ex-`CENTRALHUB_ADMIN_ROLE_CODE`) are admin-UI/API-only — a manifest is
  app-supplied config (including from a third-party ingestion, §10/§10b),
  and letting it silently affect platform authorization would be a real
  privilege-escalation surface. Both default safely (`known_app: true`,
  `admin_role_code: null`); `assets`/`engineering` get theirs back from a
  small code-owned `DEV_DEFAULT_ADMIN_ROLE_CODES` map in `apps.ts`, applied
  exactly once at the moment the manifest sync first creates that app's
  row (never on a later sync), so an admin who later clears it via the
  Apps tab stays cleared rather than having it silently resurrected.
- **Explicitly still manual, by design, not an oversight**:
  `environments/docker-compose.yml`'s per-app service block(s) and
  `gateway/conf.d/default.conf`'s app-specific blocks (the `admin` role
  gate, `assets`/`engineering`'s data-API proxy paths) — containers must
  exist before the stack starts, and Nginx's plain static-frontend routing
  was already zero-edit per app (see Pillar 2); since §10f first-party
  backend routing (`/apps/<id>/api/` → `api-<id>:4200`) is zero-edit too.
  Nothing here changes that boundary. Registering an app's metadata and actually deploying it remain
  two separate, independently-orderable steps.
- **Found via live testing, all fixed**:
  - The reachability check first shipped using a `HEAD` request and
    treating any 2xx as "Reachable" — but Nginx's `error_page 403 =
    @permission_denied` (see §7) comes back as a plain HTTP 200 rendering
    the denial page's body, not a distinguishable status code. An admin
    checking a freshly-registered app they had no `app_permissions` row
    for (deny-all default) saw it misreported as "Reachable" even though
    no container existed. Fixed by switching to `GET` and inspecting the
    response body for each page's own marker text (`"You don't have
    access to this app"` vs. the new unavailable page's copy below) — the
    same technique `scripts/test-stack.mjs` already used for exactly this
    Nginx gotcha.
  - A permission-*granted* user hitting an app with no container got a raw
    Nginx 502 — ugly, and indistinguishable from a real outage. Added a
    second styled page (`appUnavailablePage.ts`, `GET /unavailable`,
    mirroring the access-denied page's look) and a new `@app_unavailable`
    named Nginx location, wired via `error_page 502 504` (plus
    `proxy_intercept_errors on`, required for `error_page` to catch a real
    proxied error response rather than one Nginx generates itself) on both
    page-serving app locations — the generic `/apps/<name>/` block and the
    `/apps/admin/` block. Data-API proxy blocks (PostgREST/storage, §10)
    are deliberately untouched — those are `fetch()`-called API surfaces,
    not browser navigation, so a bare 502 is the right shape there, same
    reasoning as `/api/inference/`'s bare-401 policy.
  - The audit log's `app.update` entries only ever showed the row's
    current name/department, identical to `app.create` — no way to tell
    *what* an edit actually changed. Fixed the same way
    `permission.update`/`attribute.update` already do: the PUT route now
    records a `{ before, after }` pair, and the admin UI diffs every field
    for display.
  - Deleting an app stayed blocked ("still referenced by 1 permission
    row") even after clearing every checkbox for it in the Permissions
    tab. Root cause: `upsertPermission()` (`permissions.ts`) is a plain
    upsert — clearing all four verbs writes an all-`false` row rather than
    deleting it, so `countAppUsage()`'s original `COUNT(*) FROM
    app_permissions WHERE app_id = $1` kept counting that inert row as
    "in use." Fixed by only counting a row that actually grants something
    (`can_read OR can_write OR can_edit OR can_delete`) — an all-false row
    is functionally identical to no row at all, per the same deny-all
    default `getPermission()` already applies elsewhere.
- **Status**: done — backend CRUD, manifest sync (including the four
  non-platform apps), the central-hub dashboard switch, the admin Apps tab
  (icon picker, reachability check, styled flag badges), the friendly
  unavailable page, and audit diffing are all in place, verified against a
  live rebuilt stack, and covered by `scripts/test-stack.mjs`'s §6c.

---

---
