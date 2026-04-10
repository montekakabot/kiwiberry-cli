import { describe, test, expect, afterEach } from "bun:test";
import { rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { eq } from "drizzle-orm";
import { getDatabase } from "../src/db";
import { businesses, reviews, draftResponses, config } from "../src/db/schema";

function makeTempDir(): string {
  return join(tmpdir(), `kiwiberry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("getDatabase", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("creates directory and returns a working database", () => {
    const dataDir = makeTempDir();
    tempDirs.push(dataDir);

    expect(existsSync(dataDir)).toBe(false);

    const db = getDatabase(dataDir);

    expect(existsSync(dataDir)).toBe(true);
    expect(db).toBeDefined();
  });

  test("migrations create all 4 tables that accept inserts", () => {
    const dataDir = makeTempDir();
    tempDirs.push(dataDir);
    const db = getDatabase(dataDir);

    db.insert(businesses).values({ name: "Test Biz", yelpUrl: "https://yelp.com/biz/test" }).run();
    const [biz] = db.select().from(businesses).all();

    db.insert(reviews).values({
      businessId: biz.id,
      userId: "abc123",
      reviewerName: "Alice",
      rating: 5,
      postedAtRaw: "Jan 1, 2025",
      postedAtIso: "2025-01-01",
      reviewText: "Great!",
      fetchedAtIso: new Date().toISOString()
    }).run();
    const [review] = db.select().from(reviews).all();

    db.insert(draftResponses).values({
      reviewId: review.id,
      responseText: "Thanks!"
    }).run();
    const [draft] = db.select().from(draftResponses).all();

    db.insert(config).values({ key: "max-pages", value: "2" }).run();
    const [cfg] = db.select().from(config).where(eq(config.key, "max-pages")).all();

    expect(biz.name).toBe("Test Biz");
    expect(review.reviewerName).toBe("Alice");
    expect(draft.responseText).toBe("Thanks!");
    expect(cfg.value).toBe("2");
  });

  test("calling getDatabase twice on same path works without error", () => {
    const dataDir = makeTempDir();
    tempDirs.push(dataDir);

    const db1 = getDatabase(dataDir);
    db1.insert(businesses).values({ name: "Persistent Biz", yelpUrl: "https://yelp.com/biz/persist" }).run();

    const db2 = getDatabase(dataDir);
    const rows = db2.select().from(businesses).all();

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Persistent Biz");
  });

  test("deleting a business cascades to reviews and draft responses", () => {
    const dataDir = makeTempDir();
    tempDirs.push(dataDir);
    const db = getDatabase(dataDir);

    db.insert(businesses).values({ name: "Doomed Biz", yelpUrl: "https://yelp.com/biz/doomed" }).run();
    const [biz] = db.select().from(businesses).all();

    db.insert(reviews).values({
      businessId: biz.id,
      userId: "xyz789",
      reviewerName: "Bob",
      rating: 3,
      postedAtRaw: "Feb 1, 2025",
      postedAtIso: "2025-02-01",
      reviewText: "Meh",
      fetchedAtIso: new Date().toISOString()
    }).run();
    const [review] = db.select().from(reviews).all();

    db.insert(draftResponses).values({
      reviewId: review.id,
      responseText: "Sorry to hear that"
    }).run();

    // Delete the business
    db.delete(businesses).where(eq(businesses.id, biz.id)).run();

    expect(db.select().from(businesses).all()).toHaveLength(0);
    expect(db.select().from(reviews).all()).toHaveLength(0);
    expect(db.select().from(draftResponses).all()).toHaveLength(0);
  });
});
