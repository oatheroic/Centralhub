import type { Migration } from "@centralhub/service-kit";

// Append-only: each id runs exactly once per database and is recorded in
// schema_migrations. To change the schema later, add a new entry — never
// edit one that has already been applied anywhere.
export const migrations: Migration[] = [
  {
    id: "0001_init",
    sql: `
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        user_sub TEXT NOT NULL,
        user_name TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS notes_user_sub_idx ON notes (user_sub);
    `,
  },
];
