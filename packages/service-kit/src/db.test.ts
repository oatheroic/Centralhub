import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyMigrations, connectWithRetry, type MigrationPool } from "./db.js";

// A fake pool that records every statement and pretends `applied` ids are
// already in schema_migrations.
function fakePool(applied: string[], failOn?: string) {
  const log: string[] = [];
  const client = {
    query: vi.fn(async (text: string) => {
      log.push(text.trim());
      if (failOn && text.includes(failOn)) throw new Error("boom");
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool: MigrationPool = {
    query: vi.fn(async (text: string) => {
      log.push(text.trim());
      if (text.startsWith("SELECT id FROM schema_migrations")) {
        return { rows: applied.map((id) => ({ id })) };
      }
      return { rows: [] };
    }),
    connect: vi.fn(async () => client),
  };
  return { pool, client, log };
}

describe("applyMigrations", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("runs only unapplied migrations, in order, each in its own transaction", async () => {
    const { pool, client, log } = fakePool(["0001_init"]);
    await applyMigrations(
      pool,
      [
        { id: "0001_init", sql: "CREATE TABLE a ()" },
        { id: "0002_add_b", sql: "CREATE TABLE b ()" },
      ],
      "svc",
    );
    expect(log[0]).toMatch(/CREATE TABLE IF NOT EXISTS schema_migrations/);
    expect(log).not.toContain("CREATE TABLE a ()");
    expect(client.query.mock.calls.map((c) => c[0])).toEqual([
      "BEGIN",
      "CREATE TABLE b ()",
      "INSERT INTO schema_migrations (id) VALUES ($1)",
      "COMMIT",
    ]);
    expect(client.query.mock.calls[2][1]).toEqual(["0002_add_b"]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when everything is already applied", async () => {
    const { pool, client } = fakePool(["0001_init"]);
    await applyMigrations(pool, [{ id: "0001_init", sql: "x" }], "svc");
    expect(pool.connect).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
  });

  it("rolls back and rethrows with the migration id when a statement fails", async () => {
    const { pool, client } = fakePool([], "BAD SQL");
    await expect(applyMigrations(pool, [{ id: "0003_broken", sql: "BAD SQL" }], "svc")).rejects.toThrow(
      /0003_broken/,
    );
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.query).not.toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe("connectWithRetry", () => {
  it("retries until SELECT 1 succeeds, then stops", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error("not yet"))
      .mockRejectedValueOnce(new Error("not yet"))
      .mockResolvedValue({ rows: [] });
    await connectWithRetry({ query }, "svc", 5, 0);
    expect(query).toHaveBeenCalledTimes(3);
    vi.restoreAllMocks();
  });

  it("gives up after maxAttempts", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const query = vi.fn().mockRejectedValue(new Error("down"));
    await expect(connectWithRetry({ query }, "svc", 2, 0)).rejects.toThrow("down");
    expect(query).toHaveBeenCalledTimes(2);
    vi.restoreAllMocks();
  });
});
