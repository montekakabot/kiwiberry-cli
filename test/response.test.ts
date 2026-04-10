import { describe, test, expect, afterEach } from "bun:test";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getDatabase } from "../src/db";
import { addBusiness } from "../src/services/business";
import { syncReviews } from "../src/services/review";
import { addDraftResponse, listDraftResponses } from "../src/services/response";

function makeTempDir(): string {
  return join(tmpdir(), `kiwiberry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function seedReview(db: ReturnType<typeof getDatabase>) {
  const biz = addBusiness(db, "Meet Fresh", "https://www.yelp.com/biz/meet-fresh-temple-city");
  const [review] = syncReviews(db, biz.id, [{
    userId: "abc123",
    reviewerName: "Alice B.",
    reviewerLocation: "Temple City, CA",
    rating: 5,
    postedAtRaw: "Apr 1, 2026",
    postedAtIso: "2026-04-01",
    reviewText: "Amazing shaved ice!",
    fetchedAtIso: new Date().toISOString()
  }]);
  return review;
}

describe("ResponseService", () => {
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

  test("addDraftResponse saves a draft and returns the created row", () => {
    const db = setupDb();
    const review = seedReview(db);

    const draft = addDraftResponse(db, review.id, "Thanks for the kind words!");

    expect(draft.id).toBeGreaterThan(0);
    expect(draft.reviewId).toBe(review.id);
    expect(draft.responseText).toBe("Thanks for the kind words!");
    expect(draft.createdAt).toBeDefined();
  });

  test("addDraftResponse throws for non-existent review", () => {
    const db = setupDb();
    expect(() => addDraftResponse(db, 999, "hi")).toThrow("Review not found: 999");
  });

  test("addDraftResponse rejects empty response text", () => {
    const db = setupDb();
    const review = seedReview(db);
    expect(() => addDraftResponse(db, review.id, "")).toThrow();
  });

  test("addDraftResponse rejects whitespace-only response text", () => {
    const db = setupDb();
    const review = seedReview(db);
    expect(() => addDraftResponse(db, review.id, "   \n\t  ")).toThrow();
  });

  test("addDraftResponse supports multiple drafts per review", () => {
    const db = setupDb();
    const review = seedReview(db);

    const first = addDraftResponse(db, review.id, "Draft one");
    const second = addDraftResponse(db, review.id, "Draft two");

    expect(first.id).not.toBe(second.id);
    expect(first.reviewId).toBe(review.id);
    expect(second.reviewId).toBe(review.id);
  });

  test("listDraftResponses returns all drafts for the review", () => {
    const db = setupDb();
    const review = seedReview(db);

    addDraftResponse(db, review.id, "Draft one");
    addDraftResponse(db, review.id, "Draft two");

    const drafts = listDraftResponses(db, review.id);
    expect(drafts).toHaveLength(2);
    expect(drafts.map(d => d.responseText).sort()).toEqual(["Draft one", "Draft two"]);
  });

  test("listDraftResponses returns empty array when no drafts exist", () => {
    const db = setupDb();
    const review = seedReview(db);
    expect(listDraftResponses(db, review.id)).toEqual([]);
  });

  test("listDraftResponses throws for non-existent review", () => {
    const db = setupDb();
    expect(() => listDraftResponses(db, 999)).toThrow("Review not found: 999");
  });

  test("listDraftResponses only returns drafts for the specified review", () => {
    const db = setupDb();
    const biz = addBusiness(db, "Meet Fresh", "https://www.yelp.com/biz/meet-fresh-temple-city");
    const [reviewA, reviewB] = syncReviews(db, biz.id, [
      {
        userId: "alice", reviewerName: "Alice B.", reviewerLocation: null,
        rating: 5, postedAtRaw: "Apr 1, 2026", postedAtIso: "2026-04-01",
        reviewText: "Great", fetchedAtIso: new Date().toISOString()
      },
      {
        userId: "bob", reviewerName: "Bob C.", reviewerLocation: null,
        rating: 4, postedAtRaw: "Apr 2, 2026", postedAtIso: "2026-04-02",
        reviewText: "Good", fetchedAtIso: new Date().toISOString()
      }
    ]);

    addDraftResponse(db, reviewA.id, "For Alice");
    addDraftResponse(db, reviewB.id, "For Bob");

    const draftsA = listDraftResponses(db, reviewA.id);
    expect(draftsA).toHaveLength(1);
    expect(draftsA[0].responseText).toBe("For Alice");
  });
});
