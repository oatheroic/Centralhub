import { pool } from "./db.js";
import { listUsers, findUserSubByUsername } from "./keycloakAdmin.js";

// Hand-maintained, same pattern as docker-compose.yml's service list and
// apps/central-hub/src/registry/apps.ts — update all three (plus the
// README apps table) when adding a new app. Excludes central-hub (always
// reachable once logged in) and admin (gated by the Keycloak `admin` role
// instead of this table).
export const KNOWN_APPS = ["marketing", "finance", "assets"];

export type PermissionSet = {
  read: boolean;
  write: boolean;
  edit: boolean;
  delete: boolean;
};

const DENY_ALL: PermissionSet = { read: false, write: false, edit: false, delete: false };

export async function getPermission(userSub: string, appId: string): Promise<PermissionSet> {
  const result = await pool.query<{
    can_read: boolean;
    can_write: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>("SELECT can_read, can_write, can_edit, can_delete FROM app_permissions WHERE user_sub = $1 AND app_id = $2", [
    userSub,
    appId,
  ]);
  const row = result.rows[0];
  if (!row) return DENY_ALL;
  return { read: row.can_read, write: row.can_write, edit: row.can_edit, delete: row.can_delete };
}

export type PermissionMatrix = {
  users: { id: string; name: string; email: string }[];
  apps: string[];
  permissions: Record<string, Record<string, PermissionSet>>;
};

export async function getMatrix(): Promise<PermissionMatrix> {
  const users = await listUsers();
  const result = await pool.query<{
    user_sub: string;
    app_id: string;
    can_read: boolean;
    can_write: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>("SELECT user_sub, app_id, can_read, can_write, can_edit, can_delete FROM app_permissions");

  const permissions: PermissionMatrix["permissions"] = {};
  for (const user of users) {
    permissions[user.id] = {};
    for (const appId of KNOWN_APPS) {
      permissions[user.id][appId] = DENY_ALL;
    }
  }
  for (const row of result.rows) {
    if (!permissions[row.user_sub]) continue;
    permissions[row.user_sub][row.app_id] = {
      read: row.can_read,
      write: row.can_write,
      edit: row.can_edit,
      delete: row.can_delete,
    };
  }

  return {
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email })),
    apps: KNOWN_APPS,
    permissions,
  };
}

export async function upsertPermission(
  userSub: string,
  appId: string,
  patch: Partial<PermissionSet>,
): Promise<void> {
  const current = await getPermission(userSub, appId);
  const next = { ...current, ...patch };
  await pool.query(
    `INSERT INTO app_permissions (user_sub, app_id, can_read, can_write, can_edit, can_delete)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_sub, app_id)
     DO UPDATE SET can_read = $3, can_write = $4, can_edit = $5, can_delete = $6`,
    [userSub, appId, next.read, next.write, next.edit, next.delete],
  );
}

// One transaction for the whole batch — either every listed user gets the
// patch applied or none do, so a failure partway through never leaves a
// bulk grant half-applied. Reads each user's current row via the shared
// pool (outside the transaction) before writing through the transaction's
// own client — safe here because nothing else concurrently writes
// app_permissions for these rows during an admin-driven bulk action.
export async function bulkUpsertPermission(
  userSubs: string[],
  appId: string,
  patch: Partial<PermissionSet>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const userSub of userSubs) {
      const current = await getPermission(userSub, appId);
      const next = { ...current, ...patch };
      await client.query(
        `INSERT INTO app_permissions (user_sub, app_id, can_read, can_write, can_edit, can_delete)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_sub, app_id)
         DO UPDATE SET can_read = $3, can_write = $4, can_edit = $5, can_delete = $6`,
        [userSub, appId, next.read, next.write, next.edit, next.delete],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function seedRow(username: string, appId: string, grant: Partial<PermissionSet>): Promise<void> {
  const sub = await findUserSubByUsername(username);
  if (!sub) {
    console.warn(`auth-gateway: seed skipped, no Keycloak user "${username}" found`);
    return;
  }
  await pool.query(
    `INSERT INTO app_permissions (user_sub, app_id, can_read, can_write, can_edit, can_delete)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_sub, app_id) DO NOTHING`,
    [sub, appId, grant.read ?? false, grant.write ?? false, grant.edit ?? false, grant.delete ?? false],
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Dev-only demo seed data, mirroring keycloak/realm-export.json's seed
// users. Keycloak's own boot (realm import etc.) regularly takes 30-45s,
// much longer than Postgres, so this retries independently of db.ts's
// connection retry — and even after exhausting retries, logs a warning
// and lets the gateway start rather than crash-looping over seed data
// that only matters for local demos.
export async function seedDevPermissions(maxAttempts = 45, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const fullAccess = { read: true, write: true, edit: true, delete: true };
      await seedRow("dev-admin", "marketing", fullAccess);
      await seedRow("dev-admin", "finance", fullAccess);
      await seedRow("dev-admin", "assets", fullAccess);
      await seedRow("dev-user", "marketing", { read: true, write: true });
      await seedRow("dev-user", "assets", { read: true, write: true });
      // dev-user gets no row at all for finance — default-deny demonstrates
      // the permission-denied redirect page.
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.warn(`auth-gateway: dev permission seeding failed (non-fatal): ${(err as Error).message}`);
        return;
      }
      console.warn(`auth-gateway: Keycloak not ready for seeding yet (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(delayMs);
    }
  }
}
