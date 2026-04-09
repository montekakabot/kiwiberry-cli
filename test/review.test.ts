import { describe, test, expect, afterEach } from "bun:test";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getDatabase } from "../src/db";
import { addBusiness } from "../src/services/business";
import { syncReviews } from "../src/services/review";

function makeTempDir(): string {
  return join(tmpdir(), `kiwiberry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function makeReview(overrides: Partial<Parameters<typeof syncReviews>[2][number]> = {}) {
  return {
    userId: "abc123",
    reviewerName: "Alice B.",
    reviewerLocation: "Temple City, CA",
    rating: 5,
    postedAtRaw: "Apr 1, 2026",
    postedAtIso: "2026-04-01",
    reviewText: "Amazing shaved ice!",
    fetchedAtIso: new Date().toISOString(),
    locationName: "Meet Fresh - Temple City",
    ...overrides
  };
}

describe("ReviewService", () => {
  const tempDirs: string[] = [];

  function setupDb() {
    const dataDir = makeTempDir();
    tempDirs.push(dataDir);
    return getDatabase(dataDir);
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("syncReviews inserts new reviews and returns them", () => {
    const db = setupDb();
    const biz = addBusiness(db, "Meet Fresh", "https://www.yelp.com/biz/meet-fresh-temple-city");
    const reviews = [
      makeReview(),
      makeReview({
        userId: "def456",
        reviewerName: "Bob C.",
        rating: 4,
        reviewText: "Pretty good!"
      })
    ];

    const inserted = syncReviews(db, biz.id, reviews);

    expect(inserted).toHaveLength(2);
    expect(inserted[0].reviewerName).toBe("Alice B.");
    expect(inserted[1].reviewerName).toBe("Bob C.");
    expect(inserted[0].businessId).toBe(biz.id);
    expect(inserted[0].id).toBeGreaterThan(0);
  });

  test("syncReviews deduplicates by businessId + userId + postedAtIso", () => {
    const db = setupDb();
    const biz = addBusiness(db, "Meet Fresh", "https://www.yelp.com/biz/meet-fresh-temple-city");
    const review = makeReview();

    syncReviews(db, biz.id, [review]);
    const second = syncReviews(db, biz.id, [review]);

    expect(second).toHaveLength(0);
  });

  test("syncReviews rejects invalid review data", () => {
    const db = setupDb();
    const biz = addBusiness(db, "Meet Fresh", "https://www.yelp.com/biz/meet-fresh-temple-city");
    const bad = makeReview({ userId: "" });

    expect(() => syncReviews(db, biz.id, [bad])).toThrow();
  });

  test("syncReviews throws for non-existent business", () => {
    const db = setupDb();
    expect(() => syncReviews(db, 999, [makeReview()])).toThrow("Business not found: 999");
  });
});
