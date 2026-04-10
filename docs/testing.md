# Testing

## Running Tests

```bash
bun test                      # all tests
bun test test/db.test.ts      # single file
```

## Conventions

- Tests use real SQLite databases in temp directories — no mocks.
- Test through public interfaces (service functions), not implementation details.
- Each test creates its own temp dir via `makeTempDir()` and cleans up in `afterEach`.
- Assert on return values and observable behavior, not internal state.

## Current Tests

### Database (test/db.test.ts)

All tests exercise `getDatabase(dataDir)`:

| Test | What It Verifies |
|---|---|
| creates directory and returns a working database | `getDatabase` creates the data dir when it doesn't exist |
| migrations create all 4 tables that accept inserts | Inserts a row in each table (businesses, reviews, draft_responses, config) and reads it back |
| calling getDatabase twice on same path works without error | Idempotent — second call preserves existing data |
| deleting a business cascades to reviews and draft responses | FK cascade: deleting a business removes its reviews and their drafts |

### Business Service (test/business.test.ts)

Tests exercise `addBusiness`, `listBusinesses`, and `removeBusiness`:

| Test | What It Verifies |
|---|---|
| addBusiness rejects empty name | Zod validation: name must be non-empty |
| addBusiness rejects invalid URL | Zod validation: yelpUrl must be a valid URL |
| addBusiness rejects duplicate Yelp URL | DB unique constraint prevents duplicate registrations |
| addBusiness creates a record and returns it | Returns full row with id, name, yelpUrl, createdAt |
| listBusinesses returns empty array when none exist | Empty table returns `[]` |
| listBusinesses returns all added businesses | Multiple inserts all appear in list |
| removeBusiness deletes business and cascades to reviews and draft responses | FK cascade verified through service interface |
| removeBusiness returns false for non-existent id | No-op delete returns `false` |

### Config Service (test/config.test.ts)

Tests exercise `getConfig` and `setConfig`:

| Test | What It Verifies |
|---|---|
| getConfig returns default value for max-pages | Returns `"2"` before any explicit set |
| getConfig throws for unknown key | Throws `Unknown config key` for unrecognized keys |
| setConfig stores a value and getConfig retrieves it | Round-trip: set then get returns stored value |
| setConfig overwrites an existing value | Second set replaces first; get returns latest |

### Review Service (test/review.test.ts)

Tests exercise `syncReviews` and `listReviews`:

| Test | What It Verifies |
|---|---|
| syncReviews inserts new reviews and returns them | Inserts multiple reviews, returns rows with id and businessId |
| syncReviews deduplicates by businessId + userId + postedAtIso | Re-syncing same reviews returns empty array |
| syncReviews rejects invalid review data | Zod validation: empty userId throws |
| syncReviews deduplicates within the same batch | Duplicate entries in one call produce only one insert |
| syncReviews throws for non-existent business | Throws `Business not found: N` for missing ID |
| listReviews returns all reviews for a business with every field populated | Returns all stored fields: id, businessId, userId, reviewerName, reviewerLocation, rating, postedAtRaw, postedAtIso, reviewText, fetchedAtIso |
| listReviews returns empty array when business has no reviews | Existing business with no rows returns `[]` |
| listReviews only returns reviews for the specified business | Rows belonging to other businesses are excluded |
| listReviews throws for non-existent business | Throws `Business not found: N` for missing ID |

### Scraper (test/scraper.test.ts)

Tests exercise the pure helpers exported from `src/services/scraper.ts`. The end-to-end `scrapeReviews` orchestration is not tested here (see *What Not to Test*).

`extractTabIds` — parses `openclaw browser --json tabs` output:

| Test | What It Verifies |
|---|---|
| extracts all tab targetIds from openclaw tabs JSON output | Returns every `targetId` in the `tabs` array, in order |
| returns empty array when no tabs | `{"tabs": []}` → `[]` |
| returns empty array for invalid JSON | Malformed input doesn't throw |
| strips non-JSON plugin output prefix before parsing | Plugin banner lines printed before the JSON body are ignored |

`extractTargetId` — parses `openclaw browser open` output:

| Test | What It Verifies |
|---|---|
| extracts targetId from openclaw open JSON output | Returns the top-level `targetId` string |
| returns null when output has no targetId | `{}` → `null` |
| returns null for invalid JSON | Malformed input doesn't throw |
| strips non-JSON plugin output prefix before parsing | Plugin banner lines printed before the JSON body are ignored |

`findNextPageRef` — locates the pagination "Next" link ref in a snapshot:

| Test | What It Verifies |
|---|---|
| finds Next link ref on first page (no modifiers) | Matches `link "Next" [ref=…]` |
| finds Next link ref when it has [active] modifier | Matches `link "Next" [active] [ref=…]` |
| returns null when no Next link exists | Missing Next link → `null` |
| ignores button "Next" (e.g. photo gallery) | Only `link` is matched, not `button` |

`parseReviewsFromSnapshot` — extracts reviews from a Yelp AI snapshot:

| Test | What It Verifies |
|---|---|
| parses a valid review block into a ScrapedReview | Extracts userId, name, location, rating, date, and text from snapshot |
| skips non-reviewer regions | Regions whose title doesn't end with `.` (e.g. "Username", "Recommended Reviews") are ignored |
| skips review blocks missing required fields | Missing userId, rating, date, or text → the block is skipped |

## What Not to Test

- **CLI Commands** — thin wiring layer, validate manually
- **Scraper orchestration (`scrapeReviews`)** — depends on the external `openclaw` subprocess and live Yelp pages. Orchestration logic (tab-diff open/close, pagination loop, "Recommended Reviews" wait) is validated manually; the pure helpers it composes (`extractTabIds`, `extractTargetId`, `findNextPageRef`, `parseReviewsFromSnapshot`) are covered above.
