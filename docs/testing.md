# Testing

The automated end-to-end suite, and the manual checklist for what it cannot drive.

> Part of the [CentralHub documentation](../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

---

## 15. Automated end-to-end test (`scripts/test-stack.mjs`)

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
  `write:false` → `403` on INSERT, then restoring it), `apps/engineering`'s
  data-token minting and role_code resolution (dev-admin → `admin` via the
  platform-admin guarantee (now the `is_admin` claim, §7), dev-user →
  `repairer` via the
  seeded attribute rule), a real RLS boundary on `repair_jobs` (a
  `repairer`-role INSERT attempt gets `403`, not a silent accept), the
  `ensure_profile()` RPC (confirms a real `full_name`, `code` equal to the
  Keycloak username, and a freshly-refreshed `last_seen_at`, not just a
  200), the §10d repair-scheduling update (new columns readable on a
  pre-update row, `expire_pending_schedules()` cancels an overdue job and
  leaves `status` untouched, the borrowed job restored afterward), the
  §10g override→cache sync trigger and `job_history.kind` column, and the
  self-lockout / CentralHub-admin
  override-write guard (`POST .../role-overrides` targeting dev-admin's own
  sub → `400`, and its role_code stays `admin` afterward), instant session
  revocation, and logout (including that Keycloak's `prompt=login` actually
  forces a fresh credential challenge, not a silent SSO bypass). Also covers
  the Notifications primitive (§16) end to end: read-API isolation and
  unread-count correctness, all four Phase 1 producers (permission grant
  single + bulk, session revoke, admin announcement), mark-read/read-all,
  and that `/internal/notifications` isn't reachable through the public
  gateway; and §10f's backend factory: `/session/context`, the generic
  `/apps/<id>/api/` block's bare 401/403, and the admin-override cancel's
  app-originated notification landing in the owner's unread count — each
  producer assertion is delta-based (count-before vs.
  count-after around the action) rather than an absolute count, since this
  suite is meant to be rerunnable against the same persistent stack without
  a restart and notification rows accumulate as real history, unlike the
  throwaway rows §6b/§6c create and delete.
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
  catalog (MFA, per-record permissions, audit log, per-session
  tracking) — none of it is built, so there's nothing there to assert
  against yet. The background role re-sync poller (§8) is now built but
  also not covered here — its effect only becomes observable after waiting
  out a full `ROLE_SYNC_INTERVAL_MS` tick, which doesn't fit this script's
  request-per-request assertion style; verify it by hand (change a role in
  Keycloak's console, wait out the interval, confirm the next request
  reflects it without a force-logout).
- **Status**: done — 126 assertions (extended this session with the
  Notifications section, §16), verified to pass cleanly against a live
  rebuilt stack across two consecutive runs with no restart in between
  (126/126 both times, confirming the delta-based notification assertions
  above are actually idempotent and not just passing once by accident) and
  to fail with an accurate diagnostic when a permission row is corrupted by
  hand (tested by both routes: flipping the DB row directly, and confirming
  the script's own "granted" checks catch a false-200 from the Nginx gotcha
  above).

---

---

## 14b. Manual live-test checklist — platform-admin guarantee + delegation (§7)

**Already covered by automation — do not re-do by hand.**
`scripts/test-stack.mjs`: 159/159, no regressions. Targeted runs against the
live stack: 30/30 for the guarantee (`is_admin` true for `dev-admin` on all
five apps, including the three with `admin_role_code` unset; false for
`dev-user`; a non-platform-admin given `position=Manager` resolving to
`department_head`/`null` rather than admin), 24/24 for delegation, 12/12 for
self-lockout, 16/16 for the assets panel (ADM01 refused as a rule, granted
by override, the grantee becoming a real local admin of assets but not of
engineering), 6/6 for user-list narrowing (6 → 5 → 6 as one user's access to
the app was revoked and restored). Function-level behaviour was exercised
directly against both app databases, including the fail-closed cases (claim
absent, no claims at all).

**Stack state as left by those runs**, so nothing below surprises you:
`dev-user2` is currently a local admin of `engineering` (role override →
`admin`) and has attributes `Executive / Manager / Senior`; every user's
`engineering` permissions are back at the seeded `read + write` baseline
(`dev-admin` full). `engineering`'s legacy admin-granting rule has been
deleted; **`assets`' `ADM01 / any / Manager / any` rule is still there** —
step 2 below.

---

### The browser steps that remain

**1. Nothing regressed for a platform admin.**
Log in as `dev-admin` / `devadmin123`, open `/apps/engineering/` → the admin
screen loads as before, and `/apps/admin/` still works. This is the
regression that matters most: the guarantee changed how admin is derived,
and engineering's frontend still routes on `role_code` (open item, §13).

**2. Clear the last legacy rule.**
`docker logs centralhub-auth-gateway-1 | grep "grant its admin role"` should
name exactly one, for `assets`. Delete `ADM01 / any / Manager / any` from
`/apps/assets/` → "กฎเชื่อมสิทธิ์". It is already ignored when resolving a
role, but it still *displays* as an active rule, which is misleading.
Restart auth-gateway afterwards and confirm the warning is gone.

**3. Admin is absent from the *rules* picker, present in *overrides*.**
Both apps now have both sections. In engineering's panel the "add rule"
role dropdown must not offer ADMIN while the overrides dropdown still does;
in assets' panel the rules role-code list must not contain `ADM01` while
the new "กำหนดสิทธิ์รายบุคคล (ข้อยกเว้น)" section does (marked 🔑).
The server refuses either way — this checks the UI doesn't offer a choice
that cannot succeed.

**3b. Promote an assets local admin.** In assets' overrides section, grant
a user `ADM01`, log in as them, and confirm they get the app's admin tabs
and can open the rules panel. Try to delete your own override from there →
refused, same as engineering.

**4. A local admin can actually administer their app.**
Log in as `dev-user2` / `devuser2123` in a separate browser profile. All
four things that were broken should now work:
- existing matching rules are listed
- a new rule can be added and deleted
- the department / position / job-level pickers populate
- role overrides show real names, not id codes

**5. ...and only their app.** Still as `dev-user2`:
- `/apps/admin/` is refused
- the user list contains only people with access to `engineering` — as
  `dev-admin`, grant someone `engineering` access in the Permissions tab and
  watch them appear in the local admin's picker. This is the intended split:
  a platform admin decides **who may reach an app at all**, the app's own
  admin decides **what role they hold inside it**.

**6. Neither admin can be locked out.** As `dev-user2`, try to delete your
own `admin` override → refused with an explanation. Deleting *someone
else's* override still works. Then as `dev-admin`, delete `dev-user2`'s
override → succeeds, and `dev-user2` loses the admin screens on their next
page load (no logout needed; the data token's 15-minute TTL is the only
lag). Re-add it to carry on testing.

**7. Admin cannot be granted in bulk.** As either admin, try to add a rule
granting `admin`/`ADM01` by `position = Manager`. Refused with a message
pointing at role overrides. This is the guardrail that keeps every admin
grant named, single-subject and audited.

**8. Revocation still bites.** Remove the `admin` realm role from a user in
Keycloak's console and confirm their app admin access disappears within the
role poller's interval (default 60s) plus the token TTL, with no
force-logout needed.

---

**One pre-existing issue found while testing, deliberately not fixed:**
`apps/assets`'s `centralhub_perm()` throws `invalid input syntax for type
json` when `request.jwt.claims` is the empty string, because it lacks the
`NULLIF(..., '')` guard that `apps/engineering`'s equivalents (and the new
`centralhub_is_admin()`) have. It fails closed — the query errors rather
than granting — and PostgREST leaves the setting unset rather than empty in
normal operation, so nothing live hits it. Worth harmonizing whenever that
file is next touched.

---

---
