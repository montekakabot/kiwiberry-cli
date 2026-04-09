import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { config } from "../db/schema";
import type * as schema from "../db/schema";

type Db = BunSQLiteDatabase<typeof schema>;

const defaults: Record<string, string> = {
  "max-pages": "2"
};

export function setConfig(db: Db, key: string, value: string): void {
  db.insert(config).values({ key, value }).onConflictDoUpdate({
    target: config.key,
    set: { value }
  }).run();
}

export function getConfig(db: Db, key: string): string {
  const row = db.select().from(config).where(eq(config.key, key)).get();
  if (row) return row.value;
  if (key in defaults) return defaults[key];
  throw new Error(`Unknown config key: ${key}`);
}
