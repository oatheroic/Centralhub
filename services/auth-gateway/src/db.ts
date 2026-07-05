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
}
