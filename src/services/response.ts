import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { z } from "zod";
import { draftResponses, reviews } from "../db/schema";
import type * as schema from "../db/schema";

type Db = BunSQLiteDatabase<typeof schema>;

const responseTextSchema = z
  .string()
  .transform(s => s.trim())
  .refine(s => s.length > 0, { message: "Response text must not be empty" });

export function addDraftResponse(db: Db, reviewId: number, responseText: string) {
  const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
  if (!review) throw new Error(`Review not found: ${reviewId}`);

  const text = responseTextSchema.parse(responseText);

  return db
    .insert(draftResponses)
    .values({ reviewId, responseText: text })
    .returning()
    .get();
}

export function listDraftResponses(db: Db, reviewId: number) {
  const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
  if (!review) throw new Error(`Review not found: ${reviewId}`);

  return db.select().from(draftResponses).where(eq(draftResponses.reviewId, reviewId)).all();
}
