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

// Replace-all upsert, called right after a successful login and by the
// background role-sync poller, so user_roles always reflects Keycloak's
// current assignment for that user. `source` is audit-only — it labels the
// system actor ("system:login" / "system:role-sync-poller") on the audit
// row below, since neither call site has an admin actor to attribute the
// change to.
export async function syncRolesFromKeycloak(
  userSub: string,
  roles: string[],
  source: "login" | "role-sync-poller" = "login",
): Promise<void> {
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
