import { mkdirSync } from "fs";
import { join } from "path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";

export function getDatabase(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });

  const sqlite = new Database(join(dataDir, "kiwiberry.db"));
  sqlite.run("PRAGMA journal_mode = WAL;");
  sqlite.run("PRAGMA foreign_keys = ON;");

  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: join(import.meta.dir, "../../drizzle") });

  return db;
}
