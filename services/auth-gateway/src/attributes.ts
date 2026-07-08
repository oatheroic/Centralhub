import { pool } from "./db.js";
import { findUserSubByUsername } from "./keycloakAdmin.js";

export type UserAttributes = {
  department: string;
  position: string;
  jobLevel: string;
};

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

// Resolves a user's role_code for an app from their generic attributes +
// that app's rules. A rule matches if every one of its non-null criteria
// columns equals the user's corresponding attribute (a null column is a
// wildcard, matching any value). Among matching rules, the most specific
// one wins (most non-null criteria); ties broken by lowest rule id, so
// rule creation order is a stable, predictable tiebreaker.
export async function resolveRoleCode(userSub: string, appId: string): Promise<string | null> {
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
