import { describe, test, expect, afterEach } from "bun:test";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getDatabase } from "../src/db";
import { addBusiness, listBusinesses, removeBusiness } from "../src/services/business";
import { reviews, draftResponses } from "../src/db/schema";

function makeTempDir(): string {
  return join(tmpdir(), `kiwiberry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("BusinessService", () => {
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

  test("addBusiness rejects empty name", () => {
    const db = setupDb();
    expect(() => addBusiness(db, "", "https://www.yelp.com/biz/taco-palace")).toThrow();
  });

  test("addBusiness rejects invalid URL", () => {
    const db = setupDb();
    expect(() => addBusiness(db, "Taco Palace", "not-a-url")).toThrow();
  });

  test("listBusinesses returns empty array when none exist", () => {
    const db = setupDb();
    expect(listBusinesses(db)).toEqual([]);
  });

  test("listBusinesses returns all added businesses", () => {
    const db = setupDb();
    addBusiness(db, "Taco Palace", "https://www.yelp.com/biz/taco-palace");
    addBusiness(db, "Burger Barn", "https://www.yelp.com/biz/burger-barn");

    const all = listBusinesses(db);
    expect(all).toHaveLength(2);
    expect(all.map(b => b.name)).toEqual(["Taco Palace", "Burger Barn"]);
  });

  test("addBusiness returns the newly inserted record even with duplicate URLs", () => {
    const db = setupDb();
    const first = addBusiness(db, "Original", "https://www.yelp.com/biz/taco-palace");
    const second = addBusiness(db, "Duplicate", "https://www.yelp.com/biz/taco-palace");

    expect(second.id).toBeGreaterThan(first.id);
    expect(second.name).toBe("Duplicate");
  });

  test("addBusiness creates a record and returns it", () => {
    const db = setupDb();
    const biz = addBusiness(db, "Taco Palace", "https://www.yelp.com/biz/taco-palace");

    expect(biz.id).toBeGreaterThan(0);
    expect(biz.name).toBe("Taco Palace");
    expect(biz.yelpUrl).toBe("https://www.yelp.com/biz/taco-palace");
    expect(biz.createdAt).toBeDefined();
  });

  test("removeBusiness deletes business and cascades to reviews and draft responses", () => {
    const db = setupDb();
    const biz = addBusiness(db, "Doomed Biz", "https://www.yelp.com/biz/doomed");

    db.insert(reviews).values({
      businessId: biz.id,
      reviewerName: "Bob",
      rating: 3,
      postedAtRaw: "Feb 1, 2025",
      reviewText: "Meh",
      reviewUrl: "https://yelp.com/biz/doomed?hrid=xyz",
      fetchedAtIso: new Date().toISOString()
    }).run();
    const [review] = db.select().from(reviews).all();

    db.insert(draftResponses).values({
      reviewId: review.id,
      responseText: "Sorry to hear that"
    }).run();

    const removed = removeBusiness(db, biz.id);

    expect(removed).toBe(true);
    expect(listBusinesses(db)).toHaveLength(0);
    expect(db.select().from(reviews).all()).toHaveLength(0);
    expect(db.select().from(draftResponses).all()).toHaveLength(0);
  });

  test("removeBusiness returns false for non-existent id", () => {
    const db = setupDb();
    expect(removeBusiness(db, 999)).toBe(false);
  });
});
