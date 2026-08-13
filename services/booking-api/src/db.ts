import { Pool } from "pg";
import { config } from "./config.js";

// connectionTimeoutMillis bounds worst-case latency on every request during
// a DB outage — mirrors auth-gateway's db.ts.
export const pool = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 1500 });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `depends_on` only waits for the db container to start, not for Postgres to
// actually accept connections — this pool needs its own retry loop, same
// pattern as every other service in this repo.
async function connectWithRetry(maxAttempts = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      console.warn(`booking-api: Postgres not ready yet (attempt ${attempt}/${maxAttempts}), retrying...`);
      await sleep(delayMs);
    }
  }
}

export async function migrate(): Promise<void> {
  await connectWithRetry();

  // btree_gist is required for the EXCLUDE constraint below to index a
  // plain equality column (resource_id) alongside a range overlap check.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS btree_gist;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS resources (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT,
      capacity INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
      user_sub TEXT NOT NULL,
      user_name TEXT NOT NULL,
      title TEXT NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (ends_at > starts_at),
      -- The real double-booking guard: two rows for the same resource whose
      -- time ranges overlap can never both exist, enforced by Postgres
      -- itself (not just application-level checking, which would race under
      -- concurrent requests for the same slot).
      EXCLUDE USING gist (
        resource_id WITH =,
        tstzrange(starts_at, ends_at) WITH &&
      )
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS bookings_resource_range_idx ON bookings USING gist (resource_id, tstzrange(starts_at, ends_at));`);
  await pool.query(`CREATE INDEX IF NOT EXISTS bookings_user_sub_idx ON bookings (user_sub);`);
}
