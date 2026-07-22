import { pool } from "./db.js";

// Single source of truth for "what apps exist" — see db.ts's apps table
// comment for the full history (replaces the old apps/central-hub static
// registry, this service's former KNOWN_APPS constant, and attributes.ts's
// former CENTRALHUB_ADMIN_ROLE_CODE map).

export type App = {
  id: string;
  name: string;
  department: string;
  icon: string;
  description: string | null;
  hidden: boolean;
  requiresRole: string | null;
  knownApp: boolean;
  adminRoleCode: string | null;
  source: "manifest" | "manual";
};

type AppRow = {
  id: string;
  name: string;
  department: string;
  icon: string;
  description: string | null;
  hidden: boolean;
  requires_role: string | null;
  known_app: boolean;
  admin_role_code: string | null;
  source: string;
};

function toApp(row: AppRow): App {
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    icon: row.icon,
    description: row.description,
    hidden: row.hidden,
    requiresRole: row.requires_role,
    knownApp: row.known_app,
    adminRoleCode: row.admin_role_code,
    source: row.source === "manifest" ? "manifest" : "manual",
  };
}

const APP_COLUMNS =
  "id, name, department, icon, description, hidden, requires_role, known_app, admin_role_code, source";

export async function listApps(): Promise<App[]> {
  const result = await pool.query<AppRow>(`SELECT ${APP_COLUMNS} FROM apps ORDER BY id`);
  return result.rows.map(toApp);
}

export async function getApp(id: string): Promise<App | null> {
  const result = await pool.query<AppRow>(`SELECT ${APP_COLUMNS} FROM apps WHERE id = $1`, [id]);
  const row = result.rows[0];
  return row ? toApp(row) : null;
}

// Replaces the old KNOWN_APPS array — same exclusions (central-hub is
// always reachable once logged in; admin is gated by the Keycloak `admin`
// realm role instead of the app_permissions/KNOWN_APPS scheme).
export async function isKnownApp(id: string): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM apps WHERE id = $1 AND known_app = true", [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function listKnownAppIds(): Promise<string[]> {
  const result = await pool.query<{ id: string }>("SELECT id FROM apps WHERE known_app = true ORDER BY id");
  return result.rows.map((row) => row.id);
}

// Replaces attributes.ts's former guaranteedAdminRoleCodeFor(). Still only
// meaningful for apps that opted in by setting this column — most apps
// leave it NULL (see resolveRoleCode() in attributes.ts).
export async function adminRoleCodeFor(id: string): Promise<string | null> {
  const app = await getApp(id);
  return app?.adminRoleCode ?? null;
}

export type AppUsage = { appPermissions: number; appRoleRules: number; appRoleOverrides: number };

export async function countAppUsage(id: string): Promise<AppUsage> {
  const [perms, rules, overrides] = await Promise.all([
    pool.query<{ count: string }>("SELECT COUNT(*) FROM app_permissions WHERE app_id = $1", [id]),
    pool.query<{ count: string }>("SELECT COUNT(*) FROM app_role_rules WHERE app_id = $1", [id]),
    pool.query<{ count: string }>("SELECT COUNT(*) FROM app_role_overrides WHERE app_id = $1", [id]),
  ]);
  return {
    appPermissions: Number(perms.rows[0].count),
    appRoleRules: Number(rules.rows[0].count),
    appRoleOverrides: Number(overrides.rows[0].count),
  };
}

export class AppInUseError extends Error {
  constructor(public readonly usage: AppUsage) {
    super("app is still referenced by other data");
  }
}

export class AppExistsError extends Error {
  constructor() {
    super("an app with that id already exists");
  }
}

export type AppInput = {
  name: string;
  department: string;
  icon: string;
  description: string | null;
  hidden: boolean;
  requiresRole: string | null;
  knownApp: boolean;
  adminRoleCode: string | null;
};

export async function createApp(id: string, input: AppInput): Promise<App> {
  try {
    const result = await pool.query<AppRow>(
      `INSERT INTO apps (id, name, department, icon, description, hidden, requires_role, known_app, admin_role_code, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'manual')
       RETURNING ${APP_COLUMNS}`,
      [
        id,
        input.name,
        input.department,
        input.icon,
        input.description,
        input.hidden,
        input.requiresRole,
        input.knownApp,
        input.adminRoleCode,
      ],
    );
    return toApp(result.rows[0]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw new AppExistsError();
    }
    throw err;
  }
}

export async function updateApp(id: string, input: AppInput): Promise<App | null> {
  const result = await pool.query<AppRow>(
    `UPDATE apps
     SET name = $2, department = $3, icon = $4, description = $5, hidden = $6,
         requires_role = $7, known_app = $8, admin_role_code = $9
     WHERE id = $1
     RETURNING ${APP_COLUMNS}`,
    [
      id,
      input.name,
      input.department,
      input.icon,
      input.description,
      input.hidden,
      input.requiresRole,
      input.knownApp,
      input.adminRoleCode,
    ],
  );
  const row = result.rows[0];
  return row ? toApp(row) : null;
}

// Blocks deleting an app still referenced by real permission/role data —
// same rationale as attributes.ts's deleteAttributeValue: an admin-
// initiated delete of something actively in use would be a silent,
// confusing loss with no recovery path.
export async function deleteApp(id: string): Promise<void> {
  const usage = await countAppUsage(id);
  if (usage.appPermissions > 0 || usage.appRoleRules > 0 || usage.appRoleOverrides > 0) {
    throw new AppInUseError(usage);
  }
  await pool.query("DELETE FROM apps WHERE id = $1", [id]);
}

export type ManifestEntry = {
  id: string;
  name: string;
  department: string;
  icon: string;
  description: string | null;
  hidden: boolean;
  requiresRole: string | null;
};

// Dev/demo-only bootstrap for the two apps whose seed data relies on the
// "guaranteed CentralHub admin" role_code guarantee (see resolveRoleCode()
// in attributes.ts) — applied exactly once, at the moment a manifest sync
// first creates that app's row (never on a later sync, since the row will
// already exist by then and the INSERT below no-ops). NOT reachable from
// the manifest file itself — see the security-boundary comment on db.ts's
// apps table; this map is code-owned, same trust level as
// seedDevPermissions()/seedDevAttributes(). An admin who later clears this
// field via the Apps tab stays cleared — this only ever fires once, right
// after creation, not on every sync.
const DEV_DEFAULT_ADMIN_ROLE_CODES: Record<string, string> = {
  assets: "ADM01",
  engineering: "admin",
};

// Insert-if-absent only — never overwrites an existing row, whether it was
// created by the initial db.ts seed, an earlier manifest sync, or an admin.
// Deliberately does NOT accept knownApp/adminRoleCode from the manifest —
// see db.ts's apps table comment for why those stay admin-only (the one
// exception, DEV_DEFAULT_ADMIN_ROLE_CODES above, is applied here in code,
// never from the request body). Returns how many rows were newly inserted,
// purely for the sync script's own log line.
export async function upsertFromManifest(entries: ManifestEntry[]): Promise<number> {
  let inserted = 0;
  for (const entry of entries) {
    const result = await pool.query(
      `INSERT INTO apps (id, name, department, icon, description, hidden, requires_role, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'manifest')
       ON CONFLICT (id) DO NOTHING`,
      [entry.id, entry.name, entry.department, entry.icon, entry.description, entry.hidden, entry.requiresRole],
    );
    if ((result.rowCount ?? 0) > 0) {
      inserted += 1;
      const defaultCode = DEV_DEFAULT_ADMIN_ROLE_CODES[entry.id];
      if (defaultCode) {
        await pool.query("UPDATE apps SET admin_role_code = $2 WHERE id = $1", [entry.id, defaultCode]);
      }
    }
  }
  return inserted;
}
