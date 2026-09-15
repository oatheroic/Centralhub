import pg from "pg";

// Only the slice of pg.Pool the kit actually calls, so tests can pass a
// fake without standing up Postgres.
export type Queryable = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: unknown[] }>;
};
export type MigrationPool = Queryable & {
  connect: () => Promise<Queryable & { release: () => void }>;
};

// connectionTimeoutMillis bounds worst-case latency on every request during
// a DB outage — mirrors auth-gateway's db.ts.
export function createPool(databaseUrl: string): pg.Pool {
  return new pg.Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1500 });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `depends_on` only waits for the db container to start, not for Postgres to
// actually accept connections — every service in this repo needs its own
// retry loop at boot.
export async function connectWithRetry(
  pool: Queryable,
  serviceName: string,
  maxAttempts = 30,
  delayMs = 1000,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.warn(`${serviceName}: Postgres not ready yet (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(delayMs);
    }
  }
}

export type Migration = {
  // Stable, unique, sortable — e.g. "0001_init". Once a migration has been
  // recorded in schema_migrations its id must never change or be reused.
  id: string;
  sql: string;
};

// Tracked, ordered migrations: each `id` runs exactly once per database and
// is recorded in `schema_migrations`. A service's migrations list is
// append-only — adding a column later means adding a new entry, never
// editing an already-applied one. Each migration runs in its own
// transaction, so a failing statement rolls back that migration cleanly
// and leaves the recorded state consistent for the next boot.
//
// Adopting this on a database whose tables were created by an earlier
// unversioned `CREATE TABLE IF NOT EXISTS` boot is safe as long as that
// original SQL is carried over verbatim as the first migration: it re-runs
// as a no-op, then gets recorded.
export async function applyMigrations(pool: MigrationPool, migrations: Migration[], serviceName: string): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  const applied = new Set(
    ((await pool.query("SELECT id FROM schema_migrations")).rows as { id: string }[]).map((r) => r.id),
  );
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [migration.id]);
      await client.query("COMMIT");
      console.log(`${serviceName}: applied migration ${migration.id}`);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new Error(`${serviceName}: migration ${migration.id} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
