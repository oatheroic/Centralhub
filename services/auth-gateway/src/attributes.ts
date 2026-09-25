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

// Admin is deliberately not expressible as an attribute rule — it is only
// ever granted per user, by name, via app_role_overrides.
//
// Why: a rule is a bulk grant over whoever currently matches a
// department/position/job-level combination, and that set changes on its
// own as HR data changes. "position = Manager -> admin" silently promotes
// every future Manager, and the self-override guard (adminRoleOverrides.ts
// refuses to let an admin retarget their own account) is trivially routed
// around by writing a rule that happens to match yourself. Restricting
// admin to overrides makes every admin grant an explicit, named, audited
// act with exactly one subject.
//
// This binds platform admins too, not just local ones. That is intended:
// the reason is about the grant's *shape*, not the granter's rank, and a
// platform admin who wants a population promoted can still do it, one
// named override at a time.
export class AdminRoleRuleForbiddenError extends Error {
  constructor(public readonly adminRoleCode: string) {
    super(
      `"${adminRoleCode}" is this app's admin role and cannot be granted by an attribute rule — ` +
        "assign it per user with a role override instead",
    );
  }
}

// Logged once at startup rather than failing: a pre-existing admin-granting
// rule is already inert at resolve time (see resolveRoleCode()), so this is
// a cleanup prompt, not an error path. Non-fatal by construction — a
// warning about stale data must never stop the gateway from booting.
export async function warnOnAdminGrantingRules(): Promise<void> {
  try {
    const result = await pool.query<{ app_id: string; role_code: string; count: string }>(
      `SELECT r.app_id, r.role_code, COUNT(*)::text AS count
         FROM app_role_rules r
         JOIN apps a ON a.id = r.app_id
        WHERE a.admin_role_code IS NOT NULL AND r.role_code = a.admin_role_code
        GROUP BY r.app_id, r.role_code`,
    );
    for (const row of result.rows) {
      console.warn(
        `auth-gateway: ${row.count} attribute rule(s) on app "${row.app_id}" grant its admin role ` +
          `"${row.role_code}". These are IGNORED when resolving a role (admin is override-only) — ` +
          "delete them in the app's role-rules panel to stop them showing as active rules.",
      );
    }
  } catch (err) {
    console.warn(
      `auth-gateway: could not check for admin-granting role rules (non-fatal): ${(err as Error).message}`,
    );
  }
}

export async function createAppRoleRule(
  appId: string,
  roleCode: string,
  criteria: { department: string | null; position: string | null; jobLevel: string | null },
): Promise<AppRoleRule> {
  // Enforced in the data layer, not only in the route, so every caller
  // (route, seed, any future one) is bound by it — resolveRoleCode() skips
  // such a rule anyway, so accepting the write would only ever create a
  // row that silently does nothing.
  const adminRoleCode = await adminRoleCodeFor(appId);
  if (adminRoleCode && roleCode === adminRoleCode) {
    throw new AdminRoleRuleForbiddenError(adminRoleCode);
  }
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
    // Admin is never grantable by attribute match — see
    // ADMIN_RULES_FORBIDDEN below. Enforced here, not only at write time,
    // so a rule that predates the restriction (the old dev seeds created
    // exactly one: position=Manager -> the app's admin code) cannot keep
    // granting admin to a whole population. Such a row is inert rather
    // than deleted; auth-gateway logs it at startup (see
    // warnOnAdminGrantingRules()) so an admin can clear it deliberately.
    if (guaranteedAdminRoleCode && rule.roleCode === guaranteedAdminRoleCode) continue;
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

// "Is this user an admin *inside* appId" — the single notion every app
// consumes (as the `is_admin` token claim / context field). Two ways in,
// deliberately indistinguishable to the app:
//
//   1. A CentralHub Keycloak realm admin. Unconditional and not per-app
//      configurable — this is the platform-wide guarantee, so it holds even
//      for an app with no admin_role_code and no role vocabulary at all
//      (marketing/finance/resource-booking today). Note this does NOT
//      depend on adminRoleCodeFor() the way resolveRoleCode()'s own admin
//      branch does; that branch only decides which *role code* a platform
//      admin resolves to, which is a separate question from whether they
//      are an admin.
//   2. A normal user whose resolved role code (override or attribute rule)
//      equals the app's own admin role code — the "local admin" a platform
//      admin promotes. Impossible for an app with admin_role_code unset,
//      since there is then no code that means "admin" here.
//
// Nothing is written anywhere as a side effect: admin-ness is re-derived
// per request, so revoking the realm role in Keycloak (or deleting the
// override) takes effect on the next token mint with no cleanup step and no
// stale local grant left behind.
//
// `resolvedRoleCode` lets a caller that has already run resolveRoleCode()
// for this user/app (every mint site does) pass it in rather than pay for a
// second resolution; omit it and this resolves on its own.
export async function isAppAdmin(
  userSub: string,
  appId: string,
  resolvedRoleCode?: string | null,
): Promise<boolean> {
  if (await hasRole(userSub, "admin")) return true;
  const adminRoleCode = await adminRoleCodeFor(appId);
  if (!adminRoleCode) return false;
  const roleCode =
    resolvedRoleCode === undefined ? await resolveRoleCode(userSub, appId) : resolvedRoleCode;
  return roleCode === adminRoleCode;
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

// Same guard for per-user overrides: only while the app has none at all,
// so an admin's later edits/deletes in RoleRulesPanel's "Exceptions"
// section are never resurrected by a restart.
async function seedRoleOverridesIfEmpty(
  appId: string,
  overrides: { username: string; roleCode: string }[],
): Promise<void> {
  const existing = await pool.query("SELECT 1 FROM app_role_overrides WHERE app_id = $1 LIMIT 1", [appId]);
  if ((existing.rowCount ?? 0) > 0) return;
  for (const o of overrides) {
    const sub = await findUserSubByUsername(o.username);
    if (!sub) continue;
    await pool.query(
      "INSERT INTO app_role_overrides (app_id, user_sub, role_code) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [appId, sub, o.roleCode],
    );
  }
}

// Attributes only for a user who has none yet (unlike dev-admin/dev-user
// below, which are re-asserted every start as the canonical demo pair) —
// these are the live-test cast for apps/engineering, and a tester is
// expected to change them from the admin panel.
async function seedAttributesIfUnset(username: string, attrs: UserAttributes): Promise<void> {
  const sub = await findUserSubByUsername(username);
  if (!sub) return;
  if (await getUserAttributes(sub)) return;
  await upsertUserAttributes(sub, attrs);
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
      // No ADM01 (admin) rule here any more: admin is override-only (see
      // AdminRoleRuleForbiddenError), and createAppRoleRule() would now
      // reject it. Nothing is lost — dev-admin is a Keycloak realm admin,
      // so resolveRoleCode()'s platform branch returns ADM01 for them
      // regardless of any rule.
      await seedRoleRulesIfEmpty("assets", [
        { roleCode: "REQ01", department: null, position: "Staff", jobLevel: null },
      ]);
      // apps/engineering demo rule — dev-user (any department,
      // Staff/Junior) resolves to "repairer" via a department-wildcard
      // rule, the exact shape this ingestion's rule model was designed
      // around (see README's engineering ingestion section). dev-admin's
      // former "admin" rule is gone for the same reason as assets' ADM01
      // above; they still resolve to "admin" as a realm admin.
      await seedRoleRulesIfEmpty("engineering", [
        { roleCode: "repairer", department: null, position: "Staff", jobLevel: "Junior" },
      ]);
      // apps/engineering live-test cast (README §10g): one account per role,
      // all routed to the same repair group so a job filed by the reporter
      // reaches the leader, who can assign it to the repairer:
      //   dev-user4  reporter  (override)   department Finance     → ช่างผลิต
      //   dev-user5  leader    (override)   department Operations  → ช่างผลิต
      //   dev-user   repairer  (Staff/Junior rule above) Purchasing → ช่างผลิต
      //   dev-admin  admin
      // The department → repair-group routing itself is seeded on the
      // engineering side (db/migrations/20260915000004_dev_seed_aliases.sql)
      // since it lives in that app's own DB; neither the Staff/Senior nor
      // Staff/Mid attributes below match the repairer rule, so without the
      // overrides dev-user4/5 would resolve to no role at all.
      await seedAttributesIfUnset("dev-user4", { department: "Finance", position: "Staff", jobLevel: "Senior" });
      await seedAttributesIfUnset("dev-user5", { department: "Operations", position: "Staff", jobLevel: "Mid" });
      await seedRoleOverridesIfEmpty("engineering", [
        { username: "dev-user4", roleCode: "reporter" },
        { username: "dev-user5", roleCode: "leader" },
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
