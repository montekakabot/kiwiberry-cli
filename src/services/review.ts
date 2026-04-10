import { eq } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { z } from "zod";
import { reviews, businesses } from "../db/schema";
import type * as schema from "../db/schema";

type Db = BunSQLiteDatabase<typeof schema>;

const scrapedReviewSchema = z.object({
  userId: z.string().min(1),
  reviewerName: z.string().min(1),
  reviewerLocation: z.string().nullable().optional(),
  rating: z.number().min(1).max(5),
  postedAtRaw: z.string().min(1),
  postedAtIso: z.string().min(1),
  reviewText: z.string().min(1),
  fetchedAtIso: z.string().min(1)
});

export type ScrapedReview = z.infer<typeof scrapedReviewSchema>;

export function listReviews(db: Db, businessId: number) {
  const biz = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  if (!biz) throw new Error(`Business not found: ${businessId}`);

  return db.select().from(reviews).where(eq(reviews.businessId, businessId)).all();
}

export function syncReviews(db: Db, businessId: number, scrapedReviews: ScrapedReview[]) {
  const biz = db.select().from(businesses).where(eq(businesses.id, businessId)).get();
  if (!biz) throw new Error(`Business not found: ${businessId}`);

  const existing = db
    .select({ userId: reviews.userId, postedAtIso: reviews.postedAtIso })
    .from(reviews)
    .where(eq(reviews.businessId, businessId))
    .all();
  const existingKeys = new Set(existing.map(r => `${r.userId}:${r.postedAtIso}`));

  const newReviews: ScrapedReview[] = [];
  for (const raw of scrapedReviews) {
    const parsed = scrapedReviewSchema.parse(raw);
    const key = `${parsed.userId}:${parsed.postedAtIso}`;
    if (!existingKeys.has(key)) {
      existingKeys.add(key);
      newReviews.push(parsed);
    }
  }

  if (newReviews.length === 0) return [];

  return db.insert(reviews).values(
    newReviews.map(r => ({
      businessId,
      userId: r.userId,
      reviewerName: r.reviewerName,
      reviewerLocation: r.reviewerLocation ?? null,
      rating: r.rating,
      postedAtRaw: r.postedAtRaw,
      postedAtIso: r.postedAtIso,
      reviewText: r.reviewText,
      fetchedAtIso: r.fetchedAtIso
    }))
  ).returning().all();
}
