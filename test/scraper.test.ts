import { describe, test, expect } from "bun:test";
import { parseReviewsFromSnapshot } from "../src/services/scraper";

const VALID_SNAPSHOT = `
- list [ref=e1]:
  - listitem [ref=e2]:
    - region "Alice B." [ref=e3]:
      - link [ref=e4]:
        - /url: /user_details?userid=e--n82PbYbHyFkRWK0I69g
      - generic [ref=e5]: Temple City, CA
      - img "5 star rating" [ref=e6]
      - generic [ref=e7]: Apr 1, 2026
      - paragraph [ref=e8]: Amazing shaved ice!
  - listitem [ref=e9]:
`;

describe("parseReviewsFromSnapshot", () => {
  test("skips non-reviewer regions", () => {
    const snapshot = `
- list [ref=e1]:
  - listitem [ref=e2]:
    - region "Username" [ref=e3]:
      - link [ref=e4]:
        - /url: /user_details?userid=abc123
      - img "5 star rating" [ref=e5]
      - generic [ref=e6]: Apr 1, 2026
      - paragraph [ref=e7]: Some text
  - listitem [ref=e8]:
    - region "Recommended Reviews" [ref=e9]:
      - paragraph [ref=e10]: Other content
  - listitem [ref=e11]:
`;
    const reviews = parseReviewsFromSnapshot(snapshot);
    expect(reviews).toHaveLength(0);
  });

  test("skips review blocks missing required fields", () => {
    // Missing userId
    const noUserId = `
- list [ref=e1]:
  - listitem [ref=e2]:
    - region "Bob C." [ref=e3]:
      - img "4 star rating" [ref=e4]
      - generic [ref=e5]: Mar 15, 2026
      - paragraph [ref=e6]: Great place
  - listitem [ref=e7]:
`;
    expect(parseReviewsFromSnapshot(noUserId)).toHaveLength(0);

    // Missing rating
    const noRating = `
- list [ref=e1]:
  - listitem [ref=e2]:
    - region "Bob C." [ref=e3]:
      - link [ref=e4]:
        - /url: /user_details?userid=abc123
      - generic [ref=e5]: Mar 15, 2026
      - paragraph [ref=e6]: Great place
  - listitem [ref=e7]:
`;
    expect(parseReviewsFromSnapshot(noRating)).toHaveLength(0);

    // Missing date
    const noDate = `
- list [ref=e1]:
  - listitem [ref=e2]:
    - region "Bob C." [ref=e3]:
      - link [ref=e4]:
        - /url: /user_details?userid=abc123
      - img "4 star rating" [ref=e5]
      - paragraph [ref=e6]: Great place
  - listitem [ref=e7]:
`;
    expect(parseReviewsFromSnapshot(noDate)).toHaveLength(0);

    // Missing review text
    const noText = `
- list [ref=e1]:
  - listitem [ref=e2]:
    - region "Bob C." [ref=e3]:
      - link [ref=e4]:
        - /url: /user_details?userid=abc123
      - img "4 star rating" [ref=e5]
      - generic [ref=e6]: Mar 15, 2026
  - listitem [ref=e7]:
`;
    expect(parseReviewsFromSnapshot(noText)).toHaveLength(0);
  });

  test("parses a valid review block into a ScrapedReview", () => {
    const reviews = parseReviewsFromSnapshot(VALID_SNAPSHOT);

    expect(reviews).toHaveLength(1);
    expect(reviews[0].userId).toBe("e--n82PbYbHyFkRWK0I69g");
    expect(reviews[0].reviewerName).toBe("Alice B.");
    expect(reviews[0].reviewerLocation).toBe("Temple City, CA");
    expect(reviews[0].rating).toBe(5);
    expect(reviews[0].postedAtRaw).toBe("Apr 1, 2026");
    expect(reviews[0].postedAtIso).toBe("2026-04-01");
    expect(reviews[0].reviewText).toBe("Amazing shaved ice!");
    expect(reviews[0].fetchedAtIso).toBeDefined();
  });
});
