import { pool } from "./db.js";
import { recordAudit } from "./audit.js";

// Mirrors Keycloak's realm_access.roles for a user. This — not the roles
// baked into the session JWT at login — is the source of truth for role
// checks, so a role revoked in Keycloak takes effect on the very next
// request instead of waiting for the JWT to expire.

export async function getRoles(userSub: string): Promise<string[]> {
  const result = await pool.query<{ role: string }>("SELECT role FROM user_roles WHERE user_sub = $1", [userSub]);
  return result.rows.map((r) => r.role);
}

export async function hasRole(userSub: string, role: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM user_roles WHERE user_sub = $1 AND role = $2", [userSub, role]);
  return (result.rowCount ?? 0) > 0;
}

// Keycloak's realm_access.roles (both from the ID token at login and from
// the Admin API's role-mappings/realm the poller uses) always includes its
// own plumbing roles alongside real application roles: `offline_access` and
// `uma_authorization` are granted to every user via the realm's default
// role, and `default-roles-<realm>` is the composite that grants both.
// None of this repo's own role checks (hasRole(), the admin-role gate,
// resolveRoleCode()'s guarantees) ever query for these, and this repo
// doesn't use refresh tokens (see README §6 — deliberately not built) or
// Keycloak's User-Managed Access/Authorization Services, so they're pure
// noise here: no functional purpose, just clutter in user_roles, the admin
// panel's role list, and /auth/me's roles array (which several apps display
// directly). Filtered once, at the single choke point both call sites below
// already share, so nothing downstream needs its own exclusion list.
export function isKeycloakPlumbingRole(role: string): boolean {
  return role === "offline_access" || role === "uma_authorization" || role.startsWith("default-roles-");
}

// Replace-all upsert, called right after a successful login and by the
// background role-sync poller, so user_roles always reflects Keycloak's
// current assignment for that user. `source` is audit-only — it labels the
// system actor ("system:login" / "system:role-sync-poller") on the audit
// row below, since neither call site has an admin actor to attribute the
// change to.
export async function syncRolesFromKeycloak(
  userSub: string,
  rawRoles: string[],
  source: "login" | "role-sync-poller" = "login",
): Promise<void> {
  const roles = rawRoles.filter((r) => !isKeycloakPlumbingRole(r));
  const client = await pool.connect();
  let before: string[] = [];
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ role: string }>(
      "SELECT role FROM user_roles WHERE user_sub = $1",
      [userSub],
    );
    before = existing.rows.map((r) => r.role);
    await client.query("DELETE FROM user_roles WHERE user_sub = $1", [userSub]);
    for (const role of roles) {
      await client.query("INSERT INTO user_roles (user_sub, role) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
        userSub,
        role,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Diff-based, so an unchanged sync (the common case for every poller
  // tick) writes nothing — only a genuine addition/removal is worth an
  // audit row.
  const beforeSet = new Set(before);
  const afterSet = new Set(roles);
  const added = roles.filter((r) => !beforeSet.has(r));
  const removed = before.filter((r) => !afterSet.has(r));
  if (added.length > 0 || removed.length > 0) {
    void recordAudit({
      actor: { sub: null, name: `system:${source}` },
      action: "role.sync",
      targetSub: userSub,
      detail: { added, removed },
    });
  }
}
