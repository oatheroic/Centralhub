import { pool } from "./db.js";
import { findUserSubByUsername } from "./keycloakAdmin.js";
import { hasRole } from "./roles.js";

export type UserAttributes = {
  department: string;
  position: string;
  jobLevel: string;
};

// Apps that want "any CentralHub Keycloak admin is automatically this
// app's admin" as an absolute guarantee — checked first in
// resolveRoleCode(), ahead of even a per-user override, so a real
// CentralHub admin can never be locked out of admin access in one of
// these apps via a rule or override (the exact failure mode this closes:
// see README's engineering ingestion section on the dev-admin
// self-lockout incident). Opt-in, keyed by the app's own role_code string
// for "admin" — not every app's vocabulary uses the literal word.
// Only lists apps that actually resolve a role_code via this attributes/
// rules system at all (apps/marketing and apps/finance use the native
// read/write/edit/delete gate directly, with no role_code concept, so
// they have nothing to list here; apps/admin's own access is Keycloak's
// admin realm role checked directly by Nginx, same story). Hand-
// maintained the same way KNOWN_APPS is.
const CENTRALHUB_ADMIN_ROLE_CODE: Record<string, string> = {
  engineering: "admin",
  // apps/assets' own role_assignments table marks whichever role_code has
  // is_admin = true as its admin — ADM01 by seed-data convention (see
  // seedDevAttributes below and the README's assets ingestion section),
  // not a hardcoded meaning of the string itself. If assets' own seed data
  // is ever changed to use a different admin code, update this too.
  assets: "ADM01",
};

// Exposed so the override-CRUD route can reject a write that would be
// silently inert (see adminRoleOverrides.ts) — the map itself stays
// module-private so appId -> role_code is only ever read through here.
export function guaranteedAdminRoleCodeFor(appId: string): string | null {
  return CENTRALHUB_ADMIN_ROLE_CODE[appId] ?? null;
}

export async function getUserAttributes(userSub: string): Promise<UserAttributes | null> {
  const result = await pool.query<{ department: string; position: string; job_level: string }>(
    "SELECT department, position, job_level FROM user_attributes WHERE user_sub = $1",
    [userSub],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { department: row.department, position: row.position, jobLevel: row.job_level };
}

// Bulk fetch for apps/admin's UsersPanel — one round-trip for the whole
// table, same pattern as permissions.ts's getMatrix().
export async function listAllUserAttributes(): Promise<Record<string, UserAttributes>> {
  const result = await pool.query<{ user_sub: string; department: string; position: string; job_level: string }>(
    "SELECT user_sub, department, position, job_level FROM user_attributes",
  );
  const out: Record<string, UserAttributes> = {};
  for (const row of result.rows) {
    out[row.user_sub] = { department: row.department, position: row.position, jobLevel: row.job_level };
  }
  return out;
}

export async function upsertUserAttributes(userSub: string, attrs: UserAttributes): Promise<void> {
  await pool.query(
    `INSERT INTO user_attributes (user_sub, department, position, job_level)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_sub)
     DO UPDATE SET department = $2, position = $3, job_level = $4`,
    [userSub, attrs.department, attrs.position, attrs.jobLevel],
  );
}

export type AttributeKind = "department" | "position" | "job_level";
const ATTRIBUTE_KINDS: readonly AttributeKind[] = ["department", "position", "job_level"];

export function isAttributeKind(kind: string): kind is AttributeKind {
  return (ATTRIBUTE_KINDS as readonly string[]).includes(kind);
}

export async function listAttributeValues(kind: AttributeKind): Promise<string[]> {
  const result = await pool.query<{ value: string }>(
    "SELECT value FROM attribute_values WHERE kind = $1 ORDER BY value",
    [kind],
  );
  return result.rows.map((row) => row.value);
}

export async function addAttributeValue(kind: AttributeKind, value: string): Promise<void> {
  await pool.query(
    "INSERT INTO attribute_values (kind, value) VALUES ($1, $2) ON CONFLICT (kind, value) DO NOTHING",
    [kind, value],
  );
}

export type AppRoleRule = {
  id: number;
  appId: string;
  roleCode: string;
  department: string | null;
  position: string | null;
  jobLevel: string | null;
};

function toRule(row: {
  id: number;
  app_id: string;
  role_code: string;
  department: string | null;
  position: string | null;
  job_level: string | null;
}): AppRoleRule {
  return {
    id: row.id,
    appId: row.app_id,
    roleCode: row.role_code,
    department: row.department,
    position: row.position,
    jobLevel: row.job_level,
  };
}

export async function listAppRoleRules(appId: string): Promise<AppRoleRule[]> {
  const result = await pool.query<{
    id: number;
    app_id: string;
    role_code: string;
    department: string | null;
    position: string | null;
    job_level: string | null;
  }>("SELECT id, app_id, role_code, department, position, job_level FROM app_role_rules WHERE app_id = $1 ORDER BY id", [
    appId,
  ]);
  return result.rows.map(toRule);
}

export async function createAppRoleRule(
  appId: string,
  roleCode: string,
  criteria: { department: string | null; position: string | null; jobLevel: string | null },
): Promise<AppRoleRule> {
  const result = await pool.query<{
    id: number;
    app_id: string;
    role_code: string;
    department: string | null;
    position: string | null;
    job_level: string | null;
  }>(
    `INSERT INTO app_role_rules (app_id, role_code, department, position, job_level)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, app_id, role_code, department, position, job_level`,
    [appId, roleCode, criteria.department, criteria.position, criteria.jobLevel],
  );
  return toRule(result.rows[0]);
}

export async function deleteAppRoleRule(appId: string, id: number): Promise<void> {
  await pool.query("DELETE FROM app_role_rules WHERE app_id = $1 AND id = $2", [appId, id]);
}

export type AppRoleOverride = { id: number; appId: string; userSub: string; roleCode: string };

function toOverride(row: { id: number; app_id: string; user_sub: string; role_code: string }): AppRoleOverride {
  return { id: row.id, appId: row.app_id, userSub: row.user_sub, roleCode: row.role_code };
}

export async function listAppRoleOverrides(appId: string): Promise<AppRoleOverride[]> {
  const result = await pool.query<{ id: number; app_id: string; user_sub: string; role_code: string }>(
    "SELECT id, app_id, user_sub, role_code FROM app_role_overrides WHERE app_id = $1 ORDER BY id",
    [appId],
  );
  return result.rows.map(toOverride);
}

export async function upsertAppRoleOverride(appId: string, userSub: string, roleCode: string): Promise<AppRoleOverride> {
  const result = await pool.query<{ id: number; app_id: string; user_sub: string; role_code: string }>(
    `INSERT INTO app_role_overrides (app_id, user_sub, role_code)
     VALUES ($1, $2, $3)
     ON CONFLICT (app_id, user_sub) DO UPDATE SET role_code = $3
     RETURNING id, app_id, user_sub, role_code`,
    [appId, userSub, roleCode],
  );
  return toOverride(result.rows[0]);
}

export async function deleteAppRoleOverride(appId: string, id: number): Promise<void> {
  await pool.query("DELETE FROM app_role_overrides WHERE app_id = $1 AND id = $2", [appId, id]);
}

// Resolves a user's role_code for an app. Checked in order: (0) for an app
// opted into CENTRALHUB_ADMIN_ROLE_CODE above, a CentralHub Keycloak admin
// always resolves to that app's admin role_code — absolute, wins even over
// an explicit override, so a real admin can never be scoped down in that
// app by a rule/override mistake; (1) a per-user override — a named
// exception that otherwise wins outright regardless of attributes; (2) the
// app's generic attribute rules, most-specific-match-wins; (3) null if
// nothing resolves. A rule matches if every one of its non-null criteria
// columns equals the user's corresponding attribute (a null column is a
// wildcard, matching any value); ties among equally-specific rules break
// by lowest rule id, so rule creation order is a stable, predictable
// tiebreaker.
export async function resolveRoleCode(userSub: string, appId: string): Promise<string | null> {
  const guaranteedAdminRoleCode = CENTRALHUB_ADMIN_ROLE_CODE[appId];
  if (guaranteedAdminRoleCode && (await hasRole(userSub, "admin"))) {
    return guaranteedAdminRoleCode;
  }

  const overrideResult = await pool.query<{ role_code: string }>(
    "SELECT role_code FROM app_role_overrides WHERE app_id = $1 AND user_sub = $2",
    [appId, userSub],
  );
  if (overrideResult.rows[0]) return overrideResult.rows[0].role_code;

  const attrs = await getUserAttributes(userSub);
  if (!attrs) return null;
  const rules = await listAppRoleRules(appId);

  let best: { rule: AppRoleRule; specificity: number } | null = null;
  for (const rule of rules) {
    const criteria: [string | null, string][] = [
      [rule.department, attrs.department],
      [rule.position, attrs.position],
      [rule.jobLevel, attrs.jobLevel],
    ];
    const matches = criteria.every(([want, have]) => want === null || want === have);
    if (!matches) continue;
    const specificity = criteria.filter(([want]) => want !== null).length;
    if (!best || specificity > best.specificity) {
      best = { rule, specificity };
    }
  }
  return best?.rule.roleCode ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Dev-only demo seed data — mirrors permissions.ts's seedDevPermissions()
// exactly (same retry rationale: Keycloak's own boot regularly outlasts
// Postgres's). Reproduces the manual curl-seeded state from this feature's
// original testing session, so a fresh `docker compose up` demonstrates it
// working (dev-admin auto-resolves to ADM01, dev-user to REQ01) without
// needing to replay those commands by hand.
export async function seedDevAttributes(maxAttempts = 45, delayMs = 2000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const adminSub = await findUserSubByUsername("dev-admin");
      if (adminSub) {
        await upsertUserAttributes(adminSub, { department: "Executive", position: "Manager", jobLevel: "Senior" });
      }
      const userSub = await findUserSubByUsername("dev-user");
      if (userSub) {
        await upsertUserAttributes(userSub, { department: "Purchasing", position: "Staff", jobLevel: "Junior" });
      }
      await pool.query(
        `INSERT INTO app_role_rules (app_id, role_code, department, position, job_level)
         VALUES ('assets', 'ADM01', NULL, 'Manager', NULL), ('assets', 'REQ01', NULL, 'Staff', NULL)
         ON CONFLICT ON CONSTRAINT app_role_rules_unique_criteria DO NOTHING`,
      );
      // apps/engineering demo rules — dev-admin (Manager) resolves to its
      // "admin" role; dev-user (any department, Staff/Junior) resolves to
      // "repairer" via a department-wildcard rule, the exact shape this
      // ingestion's rule model was designed around (see README's
      // engineering ingestion section).
      await pool.query(
        `INSERT INTO app_role_rules (app_id, role_code, department, position, job_level)
         VALUES ('engineering', 'admin', NULL, 'Manager', NULL), ('engineering', 'repairer', NULL, 'Staff', 'Junior')
         ON CONFLICT ON CONSTRAINT app_role_rules_unique_criteria DO NOTHING`,
      );
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.warn(`auth-gateway: dev attribute seeding failed (non-fatal): ${(err as Error).message}`);
        return;
      }
      console.warn(`auth-gateway: Keycloak not ready for attribute seeding yet (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(delayMs);
    }
  }
}
