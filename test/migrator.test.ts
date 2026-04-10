import { describe, test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { applyBundledMigrations, type BundledMigration } from "../src/db/migrator";

function memoryDb(): Database {
  return new Database(":memory:");
}

describe("applyBundledMigrations", () => {
  test("applies a single migration's statements in order", () => {
    const sqlite = memoryDb();
    const migrations: BundledMigration[] = [
      {
        idx: 0,
        tag: "0000_init",
        sql: [
          "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT NOT NULL);",
          "--> statement-breakpoint",
          "INSERT INTO t (name) VALUES ('seed');"
        ].join("\n")
      }
    ];

    applyBundledMigrations(sqlite, migrations);

    const rows = sqlite.query("SELECT name FROM t").all() as { name: string }[];
    expect(rows).toEqual([{ name: "seed" }]);
  });

  test("applies migrations in idx order across multiple entries", () => {
    const sqlite = memoryDb();
    const migrations: BundledMigration[] = [
      { idx: 0, tag: "0000_init", sql: "CREATE TABLE t (id INTEGER PRIMARY KEY);" },
      { idx: 1, tag: "0001_col", sql: "ALTER TABLE t ADD COLUMN label TEXT;" }
    ];

    applyBundledMigrations(sqlite, migrations);

    sqlite.run("INSERT INTO t (label) VALUES ('ok');");
    const rows = sqlite.query("SELECT label FROM t").all() as { label: string }[];
    expect(rows).toEqual([{ label: "ok" }]);
  });

  test("is idempotent: rerunning does not reapply already-applied migrations", () => {
    const sqlite = memoryDb();
    const migrations: BundledMigration[] = [
      {
        idx: 0,
        tag: "0000_init",
        sql: "CREATE TABLE t (id INTEGER PRIMARY KEY);"
      }
    ];

    applyBundledMigrations(sqlite, migrations);
    // Re-running with the same migration list must not throw "table t already exists".
    const rerun = () => {
      applyBundledMigrations(sqlite, migrations);
    };
    expect(rerun).not.toThrow();
  });

  test("applies only pending migrations when some are already applied", () => {
    const sqlite = memoryDb();
    const first: BundledMigration[] = [
      { idx: 0, tag: "0000_init", sql: "CREATE TABLE t (id INTEGER PRIMARY KEY);" }
    ];
    applyBundledMigrations(sqlite, first);

    const both: BundledMigration[] = [
      ...first,
      { idx: 1, tag: "0001_col", sql: "ALTER TABLE t ADD COLUMN label TEXT;" }
    ];
    applyBundledMigrations(sqlite, both);

    sqlite.run("INSERT INTO t (label) VALUES ('still-works');");
    const rows = sqlite.query("SELECT label FROM t").all() as { label: string }[];
    expect(rows).toEqual([{ label: "still-works" }]);
  });

  test("unsorted input still applies in idx order", () => {
    const sqlite = memoryDb();
    const migrations: BundledMigration[] = [
      { idx: 1, tag: "0001_col", sql: "ALTER TABLE t ADD COLUMN label TEXT;" },
      { idx: 0, tag: "0000_init", sql: "CREATE TABLE t (id INTEGER PRIMARY KEY);" }
    ];

    const rerun = () => {
      applyBundledMigrations(sqlite, migrations);
    };
    expect(rerun).not.toThrow();
    sqlite.run("INSERT INTO t (label) VALUES ('ordered');");
    const rows = sqlite.query("SELECT label FROM t").all() as { label: string }[];
    expect(rows).toEqual([{ label: "ordered" }]);
  });

  test("handles statement-breakpoint markers with surrounding whitespace", () => {
    const sqlite = memoryDb();
    const migrations: BundledMigration[] = [
      {
        idx: 0,
        tag: "0000_multi",
        sql: "CREATE TABLE a (id INTEGER);\n  --> statement-breakpoint  \nCREATE TABLE b (id INTEGER);"
      }
    ];

    applyBundledMigrations(sqlite, migrations);
    expect(() => sqlite.run("INSERT INTO a VALUES (1);")).not.toThrow();
    expect(() => sqlite.run("INSERT INTO b VALUES (1);")).not.toThrow();
  });
});
