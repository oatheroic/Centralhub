import type { Migration } from "@centralhub/service-kit";

// Append-only. 0001_init is the exact SQL the pre-service-kit migrate()
// ran unconditionally at every boot — carried over verbatim so that on an
// already-populated booking-db it re-runs as a no-op and is then recorded
// in schema_migrations (see applyMigrations in @centralhub/service-kit).
export const migrations: Migration[] = [
  {
    id: "0001_init",
    sql: `
      -- btree_gist is required for the EXCLUDE constraint below to index a
      -- plain equality column (resource_id) alongside a range overlap check.
      CREATE EXTENSION IF NOT EXISTS btree_gist;

      CREATE TABLE IF NOT EXISTS resources (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        location TEXT,
        capacity INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

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

      CREATE INDEX IF NOT EXISTS bookings_resource_range_idx ON bookings USING gist (resource_id, tstzrange(starts_at, ends_at));
      CREATE INDEX IF NOT EXISTS bookings_user_sub_idx ON bookings (user_sub);
    `,
  },
];
