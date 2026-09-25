# Notifications

The platform notification primitive, its producers, and what is deliberately not built yet.

> Part of the [CentralHub documentation](../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

---

## 16. Notifications

- **Objective**: serve company-wide notifications to every user (and,
  eventually, targeted subsets) — both halves of the loop: an admin side that
  can issue one, and a user side that can see, read, and keep a history of
  what they've received. Before this, "notifications" was one hardcoded
  client constant (`apps/central-hub/src/config/announcement.ts`) rendered as
  a single dismissible banner (`SystemBanner.tsx`) — no backend, no admin UI,
  no per-account read state (dismissal was a per-browser localStorage flag),
  no history.
- **Architecture — one auth-gateway-owned table, fan-out on write**: a single
  `notifications` table (`services/auth-gateway/src/db.ts`'s `migrate()`),
  same posture as `app_permissions`/`audit_log`/`apps` — not a new database,
  not a per-app table the bell federates across. Two decisions worth
  recording, since they're easy to relitigate without the reasoning:
  - **Per-recipient rows for everything, including announcements** (fan-out
    on write), not a broadcast row + separate read-join table. Every
    notification already has its own `read_at`; recipient-subset targeting
    (department/role/specific-user, once built — see §13) falls out for free
    from who a producer chose to insert a row for, rather than needing a
    second table.
  - **A single owned table apps forward INTO**, not one table per app the
    bell reads from. The bell is one shared component rendered in every
    app's header (see below) — one session-gated read endpoint and one
    unread count is simpler and cheaper than fanning reads out across every
    app's own data layer on every poll tick.
  - `dedupe_key` (nullable, partial-unique on `(recipient_sub, dedupe_key)`)
    makes a re-fired logical event idempotent — used by the announcement
    fan-out (`announce:<uuid>`) so a retried request can't duplicate a
    broadcast to everyone. **Implementation gotcha**: a partial unique index
    needs its `WHERE` predicate repeated on the `ON CONFLICT` clause itself
    to be inferred as the arbiter — `ON CONFLICT (recipient_sub, dedupe_key)
    DO NOTHING` alone throws "no unique or exclusion constraint matching the
    ON CONFLICT specification" the moment a non-null `dedupe_key` row is
    actually inserted; it must be `ON CONFLICT (recipient_sub, dedupe_key)
    WHERE dedupe_key IS NOT NULL DO NOTHING` (`notifications.ts`'s
    `fanOutNotification()`).
  - History is bounded (most recent 50 per recipient), not pruned — no
    retention job yet, same "not needed at this scale" posture as
    `audit_log` (§7).
- **Producers (Phase 1 — all of them live inside auth-gateway itself)**:
  - **Permission grant, single-cell** (`routes/adminPermissions.ts`'s `PUT
    /admin/permissions/:userSub/:appId`): notifies only on a real
    `read: false -> true` transition (not every checkbox toggle — granting
    write/edit/delete alone, or a revoke, isn't "you can now reach
    something new"), title `"You now have access to <App name>"`, linking to
    that app. Called beside the existing `recordAudit()` call, reusing the
    same `before`/`after` diff already computed there — not inside
    `permissions.ts`'s `upsertPermission()`, which has no access to that
    context.
  - **Permission grant, bulk** (`PUT /admin/permissions/bulk`): same
    transition rule, applied per user — a bulk grant across N users produces
    one notification each for whichever subset was newly granted, not N
    notifications regardless of prior state, and not one shared notification
    for the batch (unlike the audit log, which deliberately writes one row
    for the whole batch — a notification is inherently per-recipient, an
    audit entry is a record of the admin's action).
  - **Session revoke** (`routes/adminSessions.ts`'s `PUT
    /admin/sessions/:userSub/revoke`): the revoked user's very next request
    is a 401 redirect to login, so they likely never see this live — created
    anyway (`type: "warning"`, "Your session was ended by an administrator")
    so it's waiting in their history once they log back in with a fresh,
    unrevoked session.
  - **Admin announcements** (`routes/adminAnnouncements.ts`'s `POST
    /admin/announcements`, `requireAdmin`) — the one producer with no
    existing admin action to piggyback a side-effect onto (the other three
    already have their own buttons/panels), so this is the actual "admin
    issuing a notification" surface. Resolves every user via the existing
    `listUsers()` (`keycloakAdmin.ts`) and fans out one row each with a
    shared `dedupe_key`. Audience is all-users only for now — see §13 for
    the deferred subset-targeting seam.
  - All four call `fanOutNotification()` (or its single-recipient wrapper
    `createNotification()`) in-process, the same way every route already
    calls `recordAudit()` directly — not over HTTP to
    `POST /internal/notifications`, even though that route exists (see
    below). Every producer write is fail-soft (logs and continues on
    failure — a lost notification must never block or roll back the real
    mutation it's describing), same posture as `audit.ts`.
- **Endpoints**:
  - `POST /internal/notifications` — server-to-server only, same posture as
    `/backchannel-logout` and `/internal/apps/sync` (`routes/apps.ts`):
    reachable only over the Docker network, never exposed through Nginx's
    `auth_request` gate. **Not used by any Phase 1 producer** (they call the
    in-process function directly, per above) — it exists as the seam for a
    future out-of-process producer, e.g. Phase 2's app-originated events
    (see §13). Nginx needs no location for it at all: the only `/internal/*`
    locations declared in `gateway/conf.d/default.conf` are `/internal/verify`
    and `/internal/verify-admin`, both marked `internal;`; an external
    request for `/internal/notifications` simply falls through to whichever
    generic gated location matches the path first and never reaches
    auth-gateway's real handler.
  - `GET /auth/notifications?limit=`, `GET /auth/notifications/count`,
    `POST /auth/notifications/:id/read`, `POST /auth/notifications/read-all`
    — session-gated (`requireSession`, the same shared middleware
    `adminAttributeValuesRouter` etc. already use), every query scoped to
    the resolved session's `sub`, never a client-supplied one. Mark-read on
    an id that doesn't exist or belongs to someone else both come back
    `404` (not `403`) — deliberately indistinguishable, so the response
    can't be used to probe for other users' notification ids.
- **Admin UI** (`apps/admin`): a new "Announce" tab
  (`components/AnnouncementsPanel.tsx`) — title + optional body/link, `Send
  to everyone`, no draft or schedule step. Deliberately minimal: two fields
  and a button, not a new sub-app. Shows up in the Audit tab too
  (`announcement.create`, with the recipient count).
- **User UI** (`packages/ui`'s `NotificationBell`, a Radix `Popover` — see
  §9's dependency note): a bell icon with an unread-count badge, polling
  `GET /auth/notifications/count` every 30s and pausing while the tab is
  hidden (`document.visibilitychange`, refetching immediately on becoming
  visible again). Opening it lazy-loads the recent history (unread items
  bold, read items dimmed, a left-border stripe colored by `type`); clicking
  an item marks it read and navigates its `link` if it has one; "Mark all
  read" clears the badge without deleting history. Self-contained — no
  props, its own fetch/poll logic (`packages/ui/src/notifications.ts`,
  framework-free like `theme.ts`) — same posture as `ThemeToggle` (which
  also owns its own state) rather than the "app owns the fetch" split used
  for `usePermissions.ts` (which genuinely needs a per-app `APP_ID`; nothing
  here varies per app).
  - **Wired into all five real header locations** — not just "every
    `AppShell` app," since `central-hub`, `apps/assets`, and
    `apps/engineering` each hand-author their own header (§9/§10) rather
    than using `AppShell`: `packages/ui/src/components/AppShell.tsx`
    (covers `marketing`/`finance`/`admin`/`_template`),
    `apps/central-hub/src/App.tsx`, `apps/assets/src/components/AssetsNav.tsx`,
    `apps/engineering/src/components/AppHeader.tsx` — the same four files
    that already import `ThemeToggle`, confirming no React-19 peer conflict
    (`packages/ui`'s peer range has covered `^19.0.0` since §9; `ThemeToggle`
    already proved this) — no hand-authored "twin" needed for either
    hand-authored app.
  - **Two apps needed one small Tailwind v4 alias addition** beyond what
    `ThemeToggle` already required (`--color-text`/`--color-text-muted`,
    §9): `apps/assets/src/styles.css` and `apps/engineering/src/styles.css`
    each gained `--color-bg`/`--color-surface`/`--color-danger` (assets also
    `--color-success`, mapped to its existing-but-previously-unused
    `--status-emerald`; engineering already had `--color-success`/
    `--color-warning` aliased) in their `@theme inline` blocks, mapped to
    each app's own closest existing shadcn variable — same "map to what's
    already there, don't invent a new color" approach as §9's original
    alias work, just two more token names needed since `NotificationBell`
    uses more of the shared palette than `ThemeToggle` did.
  - **A layout gotcha found via live browser verification**:
    `apps/engineering/src/components/AppHeader.tsx`'s outer header was a
    3-child `justify-between` flex (left content, `NotificationBell`,
    `ThemeToggle`) — `justify-between` spreads *all* direct children evenly,
    not just "first vs. last," so the bell landed stranded in the middle
    instead of hugging the toggle. Fixed by wrapping the two right-side
    icons in their own `flex gap-1` div, the same shape `AssetsNav.tsx` and
    `central-hub`'s own header already used.
- **Status**: done — table, all four producers, the admin Announce panel,
  and the bell in all five header locations are live and verified against
  the real stack (real Keycloak logins, real permission grants/session
  revokes/announcements, real Playwright screenshots of the bell rendering
  and opening in every location, `scripts/test-stack.mjs` extended with 24
  new assertions covering isolation, count correctness, all four producers,
  mark-read/read-all, and the internal-route unreachability proof — see §15).
- **Deferred**: realtime delivery, Phase 2 app-originated events, audience
  targeting beyond all-users, per-user preferences, and retention/pruning —
  see §13's General table for each, with why.

---

---
