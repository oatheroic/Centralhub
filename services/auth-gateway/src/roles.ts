import { pool } from "./db.js";

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

// Replace-all upsert, called right after a successful login (and available
// for a future admin action that edits roles directly) so user_roles always
// reflects Keycloak's current assignment for that user.
export async function syncRolesFromKeycloak(userSub: string, roles: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
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
}
