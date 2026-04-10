import type { Database } from "bun:sqlite";

export interface BundledMigration {
  idx: number;
  tag: string;
  sql: string;
}

const MIGRATIONS_TABLE = "__kiwiberry_migrations__";
const STATEMENT_BREAKPOINT = /^\s*-->\s*statement-breakpoint\s*$/m;

export function applyBundledMigrations(sqlite: Database, migrations: BundledMigration[]): void {
  sqlite.run(`
    CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
      idx INTEGER PRIMARY KEY,
      tag TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const appliedRows = sqlite
    .query<{ idx: number }, []>(`SELECT idx FROM ${MIGRATIONS_TABLE}`)
    .all();
  const applied = new Set(appliedRows.map((r) => r.idx));

  const pending = migrations
    .filter((m) => !applied.has(m.idx))
    .slice()
    .sort((a, b) => a.idx - b.idx);

  for (const migration of pending) {
    const statements = migration.sql
      .split(STATEMENT_BREAKPOINT)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    sqlite.transaction(() => {
      for (const stmt of statements) {
        sqlite.run(stmt);
      }
      sqlite
        .prepare(`INSERT INTO ${MIGRATIONS_TABLE} (idx, tag) VALUES (?, ?)`)
        .run(migration.idx, migration.tag);
    })();
  }
}
