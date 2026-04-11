import { describe, test, expect } from "bun:test";
import { parseReviewsFromSnapshot, findNextPageRef, extractTargetId, extractTabIds } from "../src/services/scraper";

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

describe("extractTabIds", () => {
  test("extracts all tab targetIds from openclaw tabs JSON output", () => {
    const output = `{
  "tabs": [
    { "targetId": "AAA111", "title": "Blank", "url": "about:blank", "type": "page" },
    { "targetId": "BBB222", "title": "Yelp", "url": "https://yelp.com", "type": "page" }
  ]
}`;
    expect(extractTabIds(output)).toEqual(["AAA111", "BBB222"]);
  });

  test("returns empty array when no tabs", () => {
    expect(extractTabIds("{\"tabs\": []}")).toEqual([]);
  });

  test("returns empty array for invalid JSON", () => {
    expect(extractTabIds("not json")).toEqual([]);
  });

  test("strips non-JSON plugin output prefix before parsing", () => {
    const output = `[plugins] memory-lancedb-pro: smart extraction enabled
[plugins] mdMirror: resolved 2 agent workspace(s)
{
  "tabs": [
    { "targetId": "AAA111", "title": "Yelp", "url": "https://yelp.com", "type": "page" }
  ]
}`;
    expect(extractTabIds(output)).toEqual(["AAA111"]);
  });
});

describe("extractTargetId", () => {
  test("extracts targetId from openclaw open JSON output", () => {
    const output = `{
  "targetId": "650CD55DB4290A3379C83D3238AD8C6E",
  "title": "",
  "url": "about:blank",
  "type": "page"
}`;
    expect(extractTargetId(output)).toBe("650CD55DB4290A3379C83D3238AD8C6E");
  });

  test("returns null when output has no targetId", () => {
    expect(extractTargetId("{}")).toBeNull();
  });

  test("returns null for invalid JSON", () => {
    expect(extractTargetId("not json")).toBeNull();
  });

  test("strips non-JSON plugin output prefix before parsing", () => {
    const output = `[plugins] memory-lancedb-pro: smart extraction enabled
[plugins] hook runner initialized with 1 registered hooks
{
  "targetId": "650CD55DB4290A3379C83D3238AD8C6E",
  "title": "",
  "url": "about:blank",
  "type": "page"
}`;
    expect(extractTargetId(output)).toBe("650CD55DB4290A3379C83D3238AD8C6E");
  });
});

describe("findNextPageRef", () => {
  test("finds Next link ref on first page (no modifiers)", () => {
    const snapshot = `
- navigation "Pagination navigation":
  - link "Next" [ref=e5334] [cursor=pointer]:
    - /url: https://www.yelp.com/biz/meet-fresh-temple-city?start=10
`;
    expect(findNextPageRef(snapshot)).toBe("e5334");
  });

  test("finds Next link ref when it has [active] modifier", () => {
    const snapshot = `
- navigation "Pagination navigation":
  - link "Next" [active] [ref=e2169] [cursor=pointer]:
    - /url: https://www.yelp.com/biz/meet-fresh-temple-city?start=20
`;
    expect(findNextPageRef(snapshot)).toBe("e2169");
  });

  test("returns null when no Next link exists", () => {
    const snapshot = `
- navigation "Pagination navigation":
  - link "Previous" [ref=e1234] [cursor=pointer]
`;
    expect(findNextPageRef(snapshot)).toBeNull();
  });

  test("ignores button 'Next' (e.g. photo gallery)", () => {
    const snapshot = `
- button "Next" [ref=e147] [cursor=pointer]:
  - img [ref=e149]
`;
    expect(findNextPageRef(snapshot)).toBeNull();
  });
});

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

  test("ignores business-owner response widget when extracting review text", () => {
    // Real Yelp snapshots inject a "Business owner information" region
    // alongside the reviewer's content. The review text itself is nested as
    // `- text:` children under a refless `- generic` inside the paragraph.
    // Previously the parser captured the owner-widget paragraph label
    // ("Business owner information") instead of the reviewer's actual text.
    const snapshot = `
- list [ref=e1]:
  - listitem [ref=e1368]:
    - generic [ref=e1369]:
      - generic [ref=e1371]:
        - region "lisa j." [ref=e1373]:
          - link [ref=e1377]:
            - /url: /user_details?userid=x-oG4OvNbXOmhT5U7BDzfw
          - generic [ref=e1386]: San Diego, CA
      - generic [ref=e1402]:
        - generic [ref=e1404]:
          - img "1 star rating" [ref=e1408]
          - generic [ref=e1434]: Apr 5, 2026
        - paragraph [ref=e1445]:
          - generic [ref=e1446]:
            - text: Maybe I ordered the wrong drink.
            - text: I do not recommend Meet Fresh.
      - generic [ref=e1497]:
        - region "Business owner information" [ref=e1500]:
          - paragraph [ref=e1501]: Business owner information
          - paragraph [ref=e1508]: Store M.
          - paragraph [ref=e1510]: Business Manager
  - listitem [ref=e1524]:
`;
    const reviews = parseReviewsFromSnapshot(snapshot);

    expect(reviews).toHaveLength(1);
    expect(reviews[0].reviewerName).toBe("lisa j.");
    expect(reviews[0].reviewText).not.toContain("Business owner information");
    expect(reviews[0].reviewText).toContain("Maybe I ordered the wrong drink.");
    expect(reviews[0].reviewText).toContain("I do not recommend Meet Fresh.");
  });

  test("joins nested text children from multi-paragraph review body", () => {
    // Reviewers with photos render multi-paragraph bodies as sibling `- text:`
    // children; the parser must join them rather than dropping the review
    // because no inline paragraph text exists.
    const snapshot = `
- list [ref=e1]:
  - listitem [ref=e2]:
    - region "Alan X." [ref=e3]:
      - link [ref=e4]:
        - /url: /user_details?userid=w-AxQ3Ghlsy6_4QN45lH0w
      - generic [ref=e5]: San Diego, CA
      - img "3 star rating" [ref=e6]
      - generic [ref=e7]: Mar 26, 2026
      - paragraph [ref=e8]:
        - generic [ref=e9]:
          - text: I got the chocolate egg waffle. Not bad.
          - text: The service kinda sucked.
          - text: Ambiance is good but the table was sticky.
  - listitem [ref=e20]:
`;
    const reviews = parseReviewsFromSnapshot(snapshot);

    expect(reviews).toHaveLength(1);
    expect(reviews[0].reviewerName).toBe("Alan X.");
    expect(reviews[0].reviewText).toBe(
      "I got the chocolate egg waffle. Not bad.\n\n"
      + "The service kinda sucked.\n\n"
      + "Ambiance is good but the table was sticky."
    );
  });
});
