import { pool } from "./db.js";
import { findUserSubByUsername } from "./keycloakAdmin.js";
import { hasRole } from "./roles.js";
import { adminRoleCodeFor } from "./apps.js";

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

// user_attributes' and app_role_rules' columns are named identically to
// AttributeKind ("department" | "position" | "job_level"), so this is a
// literal passthrough today — kept as a function (not inlined) so a future
// naming divergence has one place to fix instead of four call sites.
function attributeColumn(kind: AttributeKind): string {
  return kind;
}

export type AttributeValueUsage = { userAttributes: number; roleRules: number };

export async function countAttributeValueUsage(kind: AttributeKind, value: string): Promise<AttributeValueUsage> {
  const column = attributeColumn(kind);
  const [userAttrs, roleRules] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM user_attributes WHERE ${column} = $1`, [value]),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM app_role_rules WHERE ${column} = $1`, [value]),
  ]);
  return {
    userAttributes: Number(userAttrs.rows[0].count),
    roleRules: Number(roleRules.rows[0].count),
  };
}

export class AttributeValueInUseError extends Error {
  constructor(public readonly usage: AttributeValueUsage) {
    super("attribute value is still in use");
  }
}

// Blocks deleting a value still referenced by a real user or role rule —
// unlike the seed-list gap noted above (an unlisted value just displays as
// "(unlisted)"), an admin-initiated delete of something actively in use
// would be a silent, confusing loss of that reference's readability with
// no recovery path.
export async function deleteAttributeValue(kind: AttributeKind, value: string): Promise<void> {
  const usage = await countAttributeValueUsage(kind, value);
  if (usage.userAttributes > 0 || usage.roleRules > 0) {
    throw new AttributeValueInUseError(usage);
  }
  await pool.query("DELETE FROM attribute_values WHERE kind = $1 AND value = $2", [kind, value]);
}

export class AttributeValueExistsError extends Error {
  constructor() {
    super("a value with that name already exists");
  }
}

// Renames a value in place and cascades the change to every existing
// reference, so a correction (fixing a typo, updating outdated corporate
// terminology) doesn't leave user_attributes/app_role_rules pointing at a
// name that no longer appears in the managed list — unlike delete, a
// rename has an unambiguous "what should happen to existing rows" answer.
export async function renameAttributeValue(kind: AttributeKind, oldValue: string, newValue: string): Promise<void> {
  const column = attributeColumn(kind);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE attribute_values SET value = $1 WHERE kind = $2 AND value = $3",
      [newValue, kind, oldValue],
    );
    if (updated.rowCount === 0) {
      throw new Error(`no ${kind} value "${oldValue}" found`);
    }
    await client.query(`UPDATE user_attributes SET ${column} = $1 WHERE ${column} = $2`, [newValue, oldValue]);
    await client.query(`UPDATE app_role_rules SET ${column} = $1 WHERE ${column} = $2`, [newValue, oldValue]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if ((err as { code?: string }).code === "23505") {
      throw new AttributeValueExistsError();
    }
    throw err;
  } finally {
    client.release();
  }
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

export class RoleRuleExistsError extends Error {
  constructor() {
    super("a rule with this exact role/department/position/job level combination already exists");
  }
}

export async function createAppRoleRule(
  appId: string,
  roleCode: string,
  criteria: { department: string | null; position: string | null; jobLevel: string | null },
): Promise<AppRoleRule> {
  try {
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
  } catch (err) {
    // 23505 = unique_violation. app_role_rules_unique_criteria (app_id,
    // role_code, department, position, job_level, NULLS NOT DISTINCT) means
    // resubmitting an identical rule hits this rather than silently
    // no-opping like the seed function's own ON CONFLICT DO NOTHING insert
    // — surfaced as a clear 409 (see adminRoleRules.ts) instead of a raw
    // "duplicate key value violates unique constraint ..." string reaching
    // the admin UI's toast.
    if ((err as { code?: string }).code === "23505") {
      throw new RoleRuleExistsError();
    }
    throw err;
  }
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
// with apps.ts's adminRoleCode set (admin-managed, see the apps table's
// security-boundary comment in db.ts), a CentralHub Keycloak admin
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
  const guaranteedAdminRoleCode = await adminRoleCodeFor(appId);
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

// Seeds a fresh app's demo rules only while it genuinely has none yet — see
// seedDevAttributes()'s comment on why this can't be a plain ON CONFLICT DO
// NOTHING insert (that only catches re-inserting an identical row, not "an
// admin already deleted/edited what used to be here").
async function seedRoleRulesIfEmpty(
  appId: string,
  rules: { roleCode: string; department: string | null; position: string | null; jobLevel: string | null }[],
): Promise<void> {
  const existing = await pool.query("SELECT 1 FROM app_role_rules WHERE app_id = $1 LIMIT 1", [appId]);
  if ((existing.rowCount ?? 0) > 0) return;
  for (const rule of rules) {
    await pool.query(
      `INSERT INTO app_role_rules (app_id, role_code, department, position, job_level)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT app_role_rules_unique_criteria DO NOTHING`,
      [appId, rule.roleCode, rule.department, rule.position, rule.jobLevel],
    );
  }
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
      // Guarded on "does this app have ANY rule yet at all" (not just "does
      // this exact row exist") -- found live: the naive ON CONFLICT DO
      // NOTHING only stops re-inserting an identical row, so an admin who
      // deletes or edits one of these two demo rows via RoleRulesPanel got
      // it silently resurrected on the very next auth-gateway restart,
      // undoing their own deliberate change. Seeding is meant to give a
      // fresh stack a working demo, not fight an admin who's since
      // customized it -- so once an app has any rule of its own, this
      // never inserts into it again, seeded or not.
      await seedRoleRulesIfEmpty("assets", [
        { roleCode: "ADM01", department: null, position: "Manager", jobLevel: null },
        { roleCode: "REQ01", department: null, position: "Staff", jobLevel: null },
      ]);
      // apps/engineering demo rules — dev-admin (Manager) resolves to its
      // "admin" role; dev-user (any department, Staff/Junior) resolves to
      // "repairer" via a department-wildcard rule, the exact shape this
      // ingestion's rule model was designed around (see README's
      // engineering ingestion section).
      await seedRoleRulesIfEmpty("engineering", [
        { roleCode: "admin", department: null, position: "Manager", jobLevel: null },
        { roleCode: "repairer", department: null, position: "Staff", jobLevel: "Junior" },
      ]);
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
