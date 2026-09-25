# Authentication, RBAC, and revocation

Pillar 4 in full: who you are (Keycloak), what you may do (per-app permissions, role rules, the platform-admin guarantee and its delegation), and how access is taken away immediately.

> Part of the [CentralHub documentation](../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

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
  1. Nothing to do here anymore — copying in `app.manifest.json` (Pillar 1,
     step 4) registers the app with `knownApp: true` by default, which is
     what used to require a manual `KNOWN_APPS` edit in
     `services/auth-gateway/src/permissions.ts`. Flip it off from
     `apps/admin`'s Apps tab if an app should exist on the dashboard but
     never participate in the permission matrix.
  2. Copy `apps/_template/src/lib/usePermissions.ts` into the new app, set `APP_ID`.
  3. Wrap mutating handlers with `useGuardedAction(permissions, verb, handler)`
     — read-gating is automatic once the app is registered.
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

**Implementing the native gate** for a new first-party backend: use
`@centralhub/service-kit`'s `createAuth({ appId })` (§10f) — its
`authenticate` middleware forwards the `chub_session` cookie to
`GET /session/context?app=<id>` once per request (identity + all four
verbs in one response), and `requireVerb(verb)` / `hasVerb(req, verb)`
are then pure in-memory checks. Any non-200 from auth-gateway fails closed
(401 for a missing/revoked session, 502 for an unreachable gateway, 403 for
`read:false`). The single-verb `GET /session/verify-permission?app=<id>&verb=<verb>`
(bare 200/401/403) is kept for any caller that only needs that shape — e.g.
an `auth_request` in an app's own Nginx location. **Never** trust the
client-side `useGuardedAction()` hook as the gate; it is a UX affordance only.

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

---
