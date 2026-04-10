import { mkdirSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";
import { bundledMigrations } from "./migrations";
import { applyBundledMigrations } from "./migrator";

export function getDatabase(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });

  const sqlite = new Database(join(dataDir, "kiwiberry.db"));
  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA foreign_keys = ON;");

  applyBundledMigrations(sqlite, bundledMigrations);

  return drizzle(sqlite, { schema });
}
