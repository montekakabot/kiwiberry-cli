import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { z } from "zod";
import { businesses } from "../db/schema";
import type * as schema from "../db/schema";

type Db = BunSQLiteDatabase<typeof schema>;

const addBusinessInput = z.object({
  name: z.string().min(1, "Name is required"),
  yelpUrl: z.string().url("Must be a valid URL")
});

export function listBusinesses(db: Db) {
  return db.select().from(businesses).all();
}

export function removeBusiness(db: Db, id: number) {
  const existing = db.select().from(businesses).where(eq(businesses.id, id)).all();
  if (existing.length === 0) return false;
  db.delete(businesses).where(eq(businesses.id, id)).run();
  return true;
}

export function addBusiness(db: Db, name: string, yelpUrl: string) {
  addBusinessInput.parse({ name, yelpUrl });
  const existing = db.select().from(businesses).where(eq(businesses.yelpUrl, yelpUrl)).all();
  if (existing.length > 0) {
    throw new Error(`A business with this Yelp URL is already registered (id ${existing[0].id})`);
  }
  return db.insert(businesses).values({ name, yelpUrl }).returning().get();
}
