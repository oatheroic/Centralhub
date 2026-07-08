import { Pool } from "pg";
import { config } from "./config.js";

// connectionTimeoutMillis bounds worst-case latency on every gated request
// during a DB outage — observed ~5s of DNS-retry hang without it (still
// fails closed correctly either way, but a bounded fast failure is a much
// better experience than a slow one while degraded).
export const pool = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 1500 });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `depends_on` only waits for the db container to start, not for Postgres
// to actually accept connections — Keycloak masks this same race with its
// own internal retry logic, so this pool needs one too.
async function connectWithRetry(maxAttempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt === maxAttempts) {
        throw err;
      }
      console.warn(`auth-gateway: Postgres not ready yet (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(delayMs);
    }
  }
}

export async function migrate(): Promise<void> {
  await connectWithRetry();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_permissions (
      user_sub   TEXT NOT NULL,
      app_id     TEXT NOT NULL,
      can_read   BOOLEAN NOT NULL DEFAULT false,
      can_write  BOOLEAN NOT NULL DEFAULT false,
      can_edit   BOOLEAN NOT NULL DEFAULT false,
      can_delete BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (user_sub, app_id)
    );
  `);
  // Mirrors Keycloak realm role assignments so role checks (e.g. "admin")
  // can be re-verified on every request instead of trusting a role list
  // frozen into the session JWT at login time — see README "Pillar 4c".
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_roles (
      user_sub TEXT NOT NULL,
      role     TEXT NOT NULL,
      PRIMARY KEY (user_sub, role)
    );
  `);
  // Absence of a row for a user = never revoked. A session is rejected if
  // its JWT's issued-at time predates this timestamp — lets an admin (or
  // Keycloak's backchannel-logout webhook) force-invalidate an
  // already-issued, still-unexpired session instantly.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS session_revocations (
      user_sub       TEXT PRIMARY KEY,
      revoked_before TIMESTAMPTZ NOT NULL
    );
  `);
  // Generic, CentralHub-wide corporate attributes — not tied to any one
  // app. Required once set (enforced by the admin UI, not a DB constraint,
  // so existing users without a row yet don't break anything). The single
  // source of truth apps can build their own role-mapping rules against —
  // see app_role_rules below.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_attributes (
      user_sub   TEXT PRIMARY KEY,
      department TEXT NOT NULL,
      position   TEXT NOT NULL,
      job_level  TEXT NOT NULL
    );
  `);
  // Per-app rules translating the generic attributes above into that app's
  // own vocabulary (e.g. apps/assets's role_code). A NULL criteria column
  // is a wildcard — matches any value for that attribute. Resolution picks
  // the most specific matching rule (most non-null criteria) — see
  // attributes.ts's resolveRoleCode().
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_role_rules (
      id         SERIAL PRIMARY KEY,
      app_id     TEXT NOT NULL,
      role_code  TEXT NOT NULL,
      department TEXT,
      position   TEXT,
      job_level  TEXT
    );
  `);
  // Added after the table's first release — a plain CREATE TABLE IF NOT
  // EXISTS above wouldn't retrofit this onto an already-existing table
  // (e.g. a volume from before this constraint existed), so it's applied
  // separately, guarded by existence-check rather than a Postgres version
  // of "ADD CONSTRAINT IF NOT EXISTS" (unique constraints don't support
  // that clause). Lets seedDevAttributes() below use a plain ON CONFLICT
  // DO NOTHING instead of a manual existence check per row.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'app_role_rules_unique_criteria'
      ) THEN
        ALTER TABLE app_role_rules
          ADD CONSTRAINT app_role_rules_unique_criteria
          UNIQUE NULLS NOT DISTINCT (app_id, role_code, department, position, job_level);
      END IF;
    END
    $$;
  `);
  // Managed vocabulary for user_attributes' three columns — replaces free
  // text with a per-kind list an admin can pick from (apps/admin's
  // AttributeSelect) or extend (see the POST route in
  // routes/adminAttributeValues.ts). `kind` is one of "department",
  // "position", "job_level" (matches the user_attributes column names).
  // Existing free-text values not in this list still display correctly
  // (apps/admin shows them as an extra unlisted option) — this table only
  // curates what's offered going forward, it doesn't constrain what's
  // already stored.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS attribute_values (
      id    SERIAL PRIMARY KEY,
      kind  TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE (kind, value)
    );
  `);
  // Demo seed data — includes the exact values seedDevAttributes() (in
  // attributes.ts) assigns to dev-admin/dev-user, so the dropdown never
  // shows those two users' own attributes as "unlisted" out of the box.
  await pool.query(`
    INSERT INTO attribute_values (kind, value) VALUES
      ('department', 'Executive'),
      ('department', 'Purchasing'),
      ('department', 'Finance'),
      ('department', 'Marketing'),
      ('department', 'Operations'),
      ('position', 'Manager'),
      ('position', 'Staff'),
      ('position', 'Director'),
      ('position', 'Coordinator'),
      ('job_level', 'Senior'),
      ('job_level', 'Mid'),
      ('job_level', 'Junior')
    ON CONFLICT (kind, value) DO NOTHING;
  `);
}
