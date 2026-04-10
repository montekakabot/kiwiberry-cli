import { describe, test, expect, afterEach } from "bun:test";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getDatabase } from "../src/db";
import { addBusiness } from "../src/services/business";
import { listReviews, syncReviews } from "../src/services/review";

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

  test("syncReviews deduplicates within the same batch", () => {
    const db = setupDb();
    const biz = addBusiness(db, "Meet Fresh", "https://www.yelp.com/biz/meet-fresh-temple-city");
    const review = makeReview();

    const inserted = syncReviews(db, biz.id, [review, review]);

    expect(inserted).toHaveLength(1);
  });

  test("syncReviews throws for non-existent business", () => {
    const db = setupDb();
    expect(() => syncReviews(db, 999, [makeReview()])).toThrow("Business not found: 999");
  });

  test("listReviews throws for non-existent business", () => {
    const db = setupDb();
    expect(() => listReviews(db, 999)).toThrow("Business not found: 999");
  });

  test("listReviews only returns reviews for the specified business", () => {
    const db = setupDb();
    const bizA = addBusiness(db, "Meet Fresh", "https://www.yelp.com/biz/meet-fresh-temple-city");
    const bizB = addBusiness(db, "Other Shop", "https://www.yelp.com/biz/other-shop");

    syncReviews(db, bizA.id, [makeReview({ userId: "alice" })]);
    syncReviews(db, bizB.id, [makeReview({ userId: "bob" })]);

    const listed = listReviews(db, bizA.id);
    expect(listed).toHaveLength(1);
    expect(listed[0].userId).toBe("alice");
  });

  test("listReviews returns empty array when business has no reviews", () => {
    const db = setupDb();
    const biz = addBusiness(db, "Meet Fresh", "https://www.yelp.com/biz/meet-fresh-temple-city");

    expect(listReviews(db, biz.id)).toEqual([]);
  });

  test("listReviews returns all reviews for a business with every field populated", () => {
    const db = setupDb();
    const biz = addBusiness(db, "Meet Fresh", "https://www.yelp.com/biz/meet-fresh-temple-city");
    syncReviews(db, biz.id, [makeReview()]);

    const listed = listReviews(db, biz.id);

    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBeGreaterThan(0);
    expect(listed[0].businessId).toBe(biz.id);
    expect(listed[0].userId).toBe("abc123");
    expect(listed[0].reviewerName).toBe("Alice B.");
    expect(listed[0].reviewerLocation).toBe("Temple City, CA");
    expect(listed[0].rating).toBe(5);
    expect(listed[0].postedAtRaw).toBe("Apr 1, 2026");
    expect(listed[0].postedAtIso).toBe("2026-04-01");
    expect(listed[0].reviewText).toBe("Amazing shaved ice!");
    expect(listed[0].fetchedAtIso).toBeDefined();
  });
});
