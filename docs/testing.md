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

Tests exercise `syncReviews`:

| Test | What It Verifies |
|---|---|
| syncReviews inserts new reviews and returns them | Inserts multiple reviews, returns rows with id and businessId |
| syncReviews deduplicates by businessId + userId + postedAtIso | Re-syncing same reviews returns empty array |
| syncReviews rejects invalid review data | Zod validation: empty userId throws |
| syncReviews deduplicates within the same batch | Duplicate entries in one call produce only one insert |
| syncReviews throws for non-existent business | Throws `Business not found: N` for missing ID |

### Scraper (test/scraper.test.ts)

Tests exercise `parseReviewsFromSnapshot`:

| Test | What It Verifies |
|---|---|
| parses a valid review block into a ScrapedReview | Extracts userId, name, location, rating, date, and text from snapshot |
| skips non-reviewer regions | Regions not ending with "." (e.g., "Username") are ignored |
| skips review blocks missing required fields | Missing userId, rating, date, or text → skipped |

## What Not to Test

- **CLI Commands** — thin wiring layer, validate manually
- **Scraper orchestration (`scrapeReviews`)** — depends on external openclaw subprocess and live Yelp pages
