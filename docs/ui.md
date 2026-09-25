# UI/UX foundation

The shared design system, the app shell, and the responsive work.

> Part of the [CentralHub documentation](../README.md#documentation). Section numbers (§N) are **stable IDs** referenced from source-code comments — they are never renumbered, only moved between files.

---

## 9. UI/UX foundation

- **Objective**: replace hand-copied Tailwind classes, zero shared components,
  and v1-grade rough edges (raw `window.alert()`, no confirm dialogs, no
  search/sort) with a small reusable design system — without over-building
  ahead of a real consumer, and without this being mistaken for a load-bearing
  pillar. This isn't part of the numbered Phase 1-5 sequence or the Pillars
  above: those are the infrastructure the system needs to function (routing,
  environment, auth, RBAC, revocation); this is product polish on top of it,
  not a prerequisite for anything else here to work.
- **Shared foundation (`packages/ui`)**: design tokens (light + dark CSS
  variables, `darkMode: "class"`), a Tailwind preset, and reusable primitives —
  `Button`, `Card`, `Badge`, `Avatar`, `Input`, `EmptyState`, `Skeleton`,
  `Toast`/`ConfirmDialog` (built on Radix UI — the repo's first external UI
  dependency), `AppShell`, `DataTable`. A third Radix primitive,
  `@radix-ui/react-popover`, was added later for `NotificationBell` (see the
  Notifications section) — a deliberate choice over hand-rolling a dropdown
  the way `Select` was (§10's "first shared dropdown" note): a notification
  panel needs real focus-trap/escape/click-outside behavior, which is exactly
  what buying the dependency gets you. Ships as raw TypeScript source with no
  build step, consumed directly by each app's own Vite/esbuild pipeline via
  `workspace:*`. Proven end-to-end in `apps/_template`, including a
  from-scratch Docker build — each consuming app's `Dockerfile` needs one
  added `COPY packages/ui ./packages/ui` line.
- **Admin panel**: `apps/admin` adopts the foundation — an `AppShell` with
  Users/Permissions/Audit tabs, the users table replaced by a searchable/
  sortable/paginated `DataTable`, a `ConfirmDialog` gating session revoke (the
  higher-stakes, harder-to-undo action — permission-checkbox toggles stay
  instant/optimistic, unchanged, see §7), and toast notifications replacing
  `window.alert()`/inline error text for both revoke and permission-toggle
  feedback. Also added: a role-gated "Admin" card on `central-hub`'s landing
  grid (`requiresRole` on `AppRegistryEntry`), visible only to users with the
  `admin` role — a discoverability fix only; the real access gate stays
  enforced server-side by Nginx either way. The Permissions panel itself was
  later rebuilt from a hand-rolled matrix (one column per app, four stacked
  checkboxes per cell) into an app-centric master/detail `DataTable` — an app
  `Select` acts as a filter, not a column, so the layout stays flat as the
  app list grows instead of getting wider per app — see §7.
- **Landing page + department apps**: `apps/central-hub`, `apps/marketing`,
  and `apps/finance` all adopt the foundation, finishing the rollout to every
  app in the repo. Central-hub's grid gains a live search box and
  department-derived filter tabs (no hardcoded department list — pulled from
  the registry), an `EmptyState` with a "Clear filters" action when nothing
  matches, and a `Skeleton` placeholder on `IdentityBanner` while the session
  resolves; `IdentityBanner` itself gains an `Avatar` and a `Badge` for the
  role pill. `marketing`/`finance` are wrapped in `AppShell`, giving both a
  persistent "back to Central Hub" link instead of relying on browser back —
  their "Access denied" click-anywhere view keeps its exact behavior, just
  restyled onto tokens. `usePermissions.ts`'s `window.alert()` (still
  duplicated across `_template`/`marketing`/`finance`) was deliberately left
  untouched in this pass — see the toast follow-up below.
- **`usePermissions.ts`'s `window.alert()` → toast** (follow-up session):
  `useGuardedAction`'s denial path now calls `useToast().show(...)` (a danger
  toast) instead of `window.alert()`, in all three duplicated copies of the
  file (`apps/_template`, `apps/marketing`, `apps/finance`) — no extraction
  into `packages/ui` needed, since `useToast` is already a shared hook each
  file can import directly; the file stays a per-app copy by the same
  intentional-duplication convention as the rest of Pillar 1. Since
  `useGuardedAction` calls `useToast()` (a hook) during its own execution, its
  caller must render under a `ToastProvider` ancestor — `marketing`'s and
  `finance`'s `App.tsx` (which use it today) and `_template`'s `App.tsx`
  (which doesn't yet, but is the copy source for future apps) were all split
  into an outer `App` that wraps a `ToastProvider` around the real content,
  mirroring the pattern `apps/admin` already used. Verified with `tsc -b` and
  a production `vite build` in all three apps.
- **Status**: done — shared foundation, admin panel, and landing page/
  department-app rollout all complete; every app in the repo is now on
  `packages/ui`. Grouping and a dismissible announcement banner (previously
  deferred as Low-priority/optional) have since been added to
  `apps/central-hub`:
  - **Department grouping + "recently used"**: the landing grid now renders
    as per-department sections (reusing the same `departments` list already
    driving the filter tabs) instead of one flat grid, plus a "Recently
    used" section (`apps/central-hub/src/lib/recentApps.ts`, a capped
    localStorage list of the last 4 apps opened, recorded from
    `AppCard`'s click handler). Both only render on the unfiltered "All"
    view with no search text — once a department or search filter narrows
    the list, grouping/recency would just add noise on top of an
    already-short list.
  - **Announcement banner**: `apps/central-hub/src/components/SystemBanner.tsx`,
    dismissible and remembered per-announcement-id in localStorage (so
    bumping the id in `apps/central-hub/src/config/announcement.ts`
    re-surfaces a changed message to users who dismissed an earlier one).
    The config constant defaults to `null` (nothing shown) — still no
    operator need for an actual announcement yet, but the plumbing is done.
  - **Dark/light mode, every app**: `packages/ui/src/theme.ts` —
    framework-agnostic on purpose, no React import — reads/writes one
    `chub_theme` localStorage key and toggles the `dark`/`light` class on
    `<html>`. Since every app is served from the same gateway origin
    (`localhost:8080`), that one key is naturally shared across all of
    them — switching the theme in any app carries over to the rest on
    their next load. A browser with no stored preference yet starts
    **light** (flipped from dark-by-default in a later pass — see the
    responsive-redesign status entry below), regardless of the OS's own
    `prefers-color-scheme`: `applyTheme()` sets an explicit `.light` class
    on `<html>` in that case, which suppresses tokens.css's
    `prefers-color-scheme: dark` fallback block (guarded by `:not(.light)`).
    Each app's `main.tsx` calls `applyTheme(getStoredTheme())` before the
    first render (not inside a `useEffect`), so there's no flash of the
    wrong default before the resolved theme applies. `packages/ui`'s
    `ThemeToggle` (Sun/Moon icon
    button, built on the same `theme.ts`) sits at the top-right of
    `AppShell`'s header (admin/marketing/finance/`_template`) and of
    `central-hub`'s own bespoke header. `packages/ui`'s peer range was
    later widened to `^18.3.1 || ^19.0.0` (Radix's own peer ranges already
    supported React 19 — verified via `npm view`), so `apps/assets` and
    `apps/engineering` now import the real `ThemeToggle` component instead
    of hand-authoring a duplicate — see §10/§10b. `AppShell` itself is
    still not imported by either app: its own Tailwind v4/shadcn stack
    stays as-is, so `AssetsNav.tsx`/`AppHeader.tsx` remain hand-authored
    header layouts, just with a shared toggle button inside them. Making
    `ThemeToggle`'s classes (`text-text-muted`, `hover:bg-border`, etc.)
    actually resolve required two small additions per app: an
    `@source "../../../packages/ui/src"` line in `styles.css` (Tailwind v4's
    `source(none)` mode only scans explicitly declared paths, so a
    workspace package's own source is otherwise invisible to it) and a
    `--color-text`/`--color-text-muted` alias in the `@theme inline` block
    mapping to each app's existing `--foreground`/`--muted-foreground`
    variables (packages/ui's components use chub's own token names, which
    don't exist natively in either app's shadcn-derived theme). `apps/assets`'s
    own `styles.css` already shipped a full shadcn `.dark` palette from the
    original Lovable export — unused until now, since nothing ever toggled
    the class; no further CSS changes were needed there, only the toggle
    and the alias above.
  - **Space efficiency**: `AppShell`'s content area, and `central-hub`'s own
    equivalent container, were hard-capped at `max-w-5xl` (1024px)
    regardless of viewport — wasted room on any screen wider than a small
    laptop. Both are now `w-full max-w-[1600px]` with responsive padding,
    so they use whatever width is actually available and only cap on
    ultra-wide monitors for line-length readability; `central-hub`'s app
    grid also gained an `xl:grid-cols-4` breakpoint so the extra width
    shows more cards per row instead of just more margin. `apps/admin`'s
    `AttributeSelect` (below) is `w-full` with a `min-w-[9rem]` floor for
    the same reason — it was a fixed 112px regardless of how much room its
    `DataTable` column actually had.
  - **`central-hub` responsive/multi-device redesign + own-department
    pinning**: the landing dashboard's grid/header/search/filter/recency UI
    (all of the above, previously desktop-first with only incidental
    `sm`/`lg`/`xl` breakpoints) was reworked for three explicit tiers —
    desktop, tablet (≤1024px), phone (≤640px) — rather than one blunt
    breakpoint. Search collapses to an icon button that opens a full-width
    row below the header on phone (same `query` state as the desktop input,
    no dual-input sync needed); filter tabs and the "Recently used" row both
    scroll horizontally with scroll-snap (recency as one row at every
    breakpoint, not just phone — a better fit for a short, order-matters
    list generally); the search/filter row is sticky so it stays reachable
    while scrolling a long grouped department list; `env(safe-area-inset-*)`
    padding on the header/content wrapper; a `[@media(pointer:coarse)]:`
    rule bumps interactive targets (theme toggle, tabs, close buttons) to
    ~40–44px independent of viewport width, catching touch-only tablets in
    landscape. Five new `--dept-*` color tokens (`packages/ui/src/tokens.css`)
    give each department a left-stripe on `AppCard`, a swatch in the filter
    tabs, and (new optional `Avatar` `ringVar` prop) a ring on the signed-in
    user's own avatar — matched case-insensitively against the real
    `attribute_values`-managed department strings (`Marketing`, `Finance`,
    `Engineering`, `Operations`, `Platform` as seeded — **not** the
    app-id-shaped names like `assets`/`admin` a first pass assumed), with a
    neutral fallback for anything unrecognized. Own-department pinning: in
    the unfiltered "All" view, the section matching the signed-in user's
    `department` (now surfaced on `GET /auth/me` alongside `position`/
    `jobLevel`, pulled from the existing `user_attributes` table — a small,
    intentionally-generic auth-gateway addition so a future feature needing
    `position`/`jobLevel` doesn't need another round-trip) renders right
    after Recently used, tagged "Your team"; falls back to normal order with
    no special-casing when the user has no department set or their
    department has zero visible apps (both fall out of the existing
    `departments` derivation automatically). Filter-tab order itself is
    deliberately left unaffected by identity, so the tab list doesn't
    reorder itself out from under a returning user. Verified against the
    live stack (real Keycloak login, headless-Chrome screenshots at each
    tier, a temporary department reassignment to exercise the pinning path)
    rather than by inspection alone.
  - **Admin `apps/admin` responsive pass is still deferred**, not part of
    this session — see §13. The "Add app" Department free-text field →
    managed-dropdown fix (the other item deferred alongside it) has since
    been done in a follow-up session: `AppFormDialog.tsx`'s Department field
    is now an `AttributeSelect` (the same managed-vocabulary picker
    `UsersPanel` uses), sourced from `GET /auth/admin/attribute-values/department`
    with a "+ Add new..." path that posts through the same endpoint — no
    backend change needed, both already existed. Verified against the live
    stack: create-mode dropdown lists the real seeded departments, edit-mode
    pre-selects the row's existing value correctly.

---

---
