# Glossary

Several words in this repo mean more than one thing, and the differences are
load-bearing. If you are new here, read this before `auth-and-rbac.md`.

> Part of the [CentralHub documentation](../README.md#documentation).

---

## "admin" means four different things

| Term | What it actually is | Where it lives |
|---|---|---|
| **Platform admin** (CentralHub admin) | Holds Keycloak's `admin` **realm role**. Is an admin of *every* app, unconditionally, with no per-app configuration. | Keycloak, mirrored into `user_roles` and checked live by `hasRole()` |
| **Local admin** (app admin) | An ordinary user whose resolved `role_code` for one app equals that app's `apps.admin_role_code`. Admin of *that app only*. | `app_role_overrides` → `apps.admin_role_code` |
| **`is_admin`** | The claim an app actually reads. True for **either** of the above. Apps deliberately cannot tell them apart — there is one local notion of "admin here". | `isAppAdmin()`, minted into the data token and `/session/context` |
| **`apps/admin`** | The admin *UI application* at `/apps/admin/`. Gated on the realm role, not on `is_admin`. | `apps/admin` |

Practical consequence: "make them an admin" is ambiguous. Granting the realm
role in Keycloak makes someone an admin **everywhere**; adding a role override
makes them an admin of **one app**. Only a platform admin can do the first.

## "role" means four different things

| Term | What it is |
|---|---|
| **Realm role** | Keycloak's own roles. Only two exist: `admin` and `user`. |
| **`role_code`** | An app's *own* role vocabulary, resolved by auth-gateway and carried as a JWT claim. `apps/engineering` uses `admin`/`leader`/`department_head`/`repairer`/`reporter`; `apps/assets` uses `ADM01`/`APP01`/`REQ01`/`AST01`/`PUR01`/`ACC01`. The two vocabularies are unrelated. |
| **Postgres role** | `<app>_authenticated` (e.g. `assets_authenticated`) — what PostgREST switches to per request so RLS applies. |
| **`role` claim** | In the minted JWT, the *Postgres* role above — not a business role. |

`apps/engineering` deliberately has **no `user_roles` table**: a user's role
there is whatever the token says, re-derived per request, never stored.

## Permissions vs. roles vs. attributes

Three separate layers. A user needs the right answer from each.

| Layer | Question it answers | Storage | Set by |
|---|---|---|---|
| **Verbs / permissions** | May you reach this app at all, and may you write/edit/delete in it? Four booleans per (user, app). | `app_permissions` | Platform admin, in `apps/admin`'s Permissions tab |
| **Attributes** | Who is this person, in corporate terms? `department`, `position`, `job_level`, drawn from a managed vocabulary. | `user_attributes`, `attribute_values` | Platform admin, in `apps/admin`'s Users tab |
| **`role_code`** | What can they do *inside* one app? | Resolved live, never stored | A **role rule** or a **role override** (below) |

## Role rules vs. role overrides

Both map a person to a `role_code`. They differ in shape, and the difference
is a security boundary.

- **Role rule** (`app_role_rules`) — a *bulk* grant: "department X + position Y
  + job level Z → this role code". Any null criterion is a wildcard;
  most-specific match wins. The matching set changes on its own as HR data
  changes.
- **Role override** (`app_role_overrides`) — a *named* grant for one user.
  Checked **before** rules, so it always wins.

**An admin role code can only be granted by an override, never a rule.**
A rule would silently promote everyone who later matches it. Enforced at write
time, at resolve time, and in both apps' pickers.

Resolution order in `resolveRoleCode()`: platform-admin guarantee → override →
most specific matching rule → `null`.

## "department" means three different things

This one has caused real bugs; `apps/engineering`'s schema carries a comment
block about it.

| Meaning | Where |
|---|---|
| The CentralHub user attribute — where someone works | `user_attributes.department`, passed to apps as the `dept_name` claim |
| `apps/engineering`'s **repair group** (สังกัดช่าง) — which team fixes your machines | `engineering-db`'s `departments`, resolved from the attribute via `department_aliases` |
| `apps/assets`' dropdown values — free-form document fields | `assets-db`'s `dropdown_options` |

They are not the same list and are not kept in sync on purpose.

## The two enforcement models

Which one an app uses is the first architectural decision you make about it.
The decision tree is in
[auth-and-rbac.md](auth-and-rbac.md#choosing-an-enforcement-model-native-gate-vs-minted-jwtrls).

| | **Native gate** | **Minted-JWT / RLS** |
|---|---|---|
| For | First-party backends you control | Third-party apps with their own data layer |
| How | Backend calls `/session/context?app=<id>` per request via `@centralhub/service-kit` | Browser fetches a 15-minute JWT from `/auth/data-token?app=<id>`; PostgREST/storage-api verify it themselves |
| Enforced by | Your own route handlers | Postgres RLS policies |
| Example | `services/booking-api` | `apps/assets`, `apps/engineering` |

## Tokens and sessions

| Thing | What it is |
|---|---|
| **`chub_session`** | The browser's session cookie, set by auth-gateway after the Keycloak login flow. Identity only — roles and permissions are looked up live, never baked in. |
| **Data token** | A short-lived (15 min) HS256 JWT from `/auth/data-token`, signed with `PGRST_JWT_SECRET` and verified by an app's *own* PostgREST/storage. Carries `perm`, `role_code`, `is_admin`, `dept_name`, `sub`. |
| **Session context** | `GET /session/context?app=<id>` — the native-gate equivalent, returning the same facts as JSON to a trusted backend. |
| **Revocation** | `session_revocations` holds a per-user cutoff timestamp; every gated request checks it, so a revoked session dies on its next request rather than at token expiry. |

## App registration

| Term | Meaning |
|---|---|
| **Manifest** | `app.manifest.json` in an app folder. The `apps-manifest-sync` one-shot service upserts it into the `apps` table at stack start. Cannot set anything security-relevant. |
| **`known_app`** | Whether the app appears in the permission matrix. Admin-settable only, never from a manifest. |
| **`admin_role_code`** | Which of the app's own role codes means "admin here". Admin-settable only. Unset is fine — it just means the app has no local admins; platform admins still are. |
