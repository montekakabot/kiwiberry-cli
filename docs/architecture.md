# Architecture

## Structure

```
src/
  index.ts            — citty root command entrypoint
  commands/
    business.ts       — business add/list/remove subcommands
    config.ts         — config get/set subcommands
    fetch.ts          — fetch reviews for a business
    reviews.ts        — list stored reviews for a business
  db/
    schema.ts         — Drizzle ORM schema (4 tables)
    index.ts          — getDatabase(dataDir) auto-init + migrations
  services/
    business.ts       — business CRUD with Zod validation
    config.ts         — config key-value get/set with defaults
    review.ts         — review sync/dedup logic with Zod validation
    scraper.ts        — Yelp scraper via openclaw browser CLI
test/
  db.test.ts          — database layer tests
  business.test.ts    — business service tests
  config.test.ts      — config service tests
  review.test.ts      — review service tests
  scraper.test.ts     — scraper parsing / helper tests
drizzle/
  0000_*.sql          — initial migration (tables)
  0001_*.sql          — add unique index on businesses.yelp_url
  0002_*.sql          — replace review_url with user_id, add composite unique index
  0003_*.sql          — drop location_name column from reviews
```

## Database Layer

### Public Interface

```typescript
getDatabase(dataDir: string): BunSQLiteDatabase
```

Takes a directory path, creates it if missing, opens SQLite with WAL mode + foreign keys enabled, runs all pending Drizzle migrations, and returns a Drizzle DB instance.

The production data directory is `~/.kiwiberry/`, with the DB file at `~/.kiwiberry/kiwiberry.db`.

### Schema

| Table | Key Columns | Constraints | Relationships |
|---|---|---|---|
| `businesses` | id, name, yelp_url, created_at | yelp_url UNIQUE | — |
| `reviews` | id, business_id, user_id, reviewer_name, reviewer_location, rating, posted_at_raw, posted_at_iso, review_text, fetched_at_iso | UNIQUE(business_id, user_id, posted_at_iso) | FK → businesses (CASCADE) |
| `draft_responses` | id, review_id, response_text, created_at | — | FK → reviews (CASCADE) |
| `config` | key (PK), value | — | — |

Cascade deletes: removing a business deletes its reviews, which in turn deletes their draft responses.

## Service Layer

Services contain all business logic. They accept a Drizzle DB instance and return plain data. Input validation uses Zod.

### Business Service (`src/services/business.ts`)

```typescript
addBusiness(db, name, yelpUrl)    // → created row; throws on invalid input or duplicate URL
listBusinesses(db)                // → array of all businesses
removeBusiness(db, id)            // → true if deleted, false if not found
```

- Zod validates name (non-empty) and yelpUrl (valid URL) before insert.
- Duplicate Yelp URLs are rejected at the DB level (unique constraint), not via a preflight read.

### Config Service (`src/services/config.ts`)

```typescript
setConfig(db, key, value)  // → void; upserts key-value pair (insert or overwrite)
getConfig(db, key)         // → string; returns DB value, then default, or throws for unknown key
```

- Defaults are defined in-code: `max-pages` = `"2"`.
- `setConfig` uses `onConflictDoUpdate` so setting the same key twice overwrites the value.
- `getConfig` checks the DB first, falls back to defaults, and throws `Unknown config key: <key>` for unrecognized keys.

### Review Service (`src/services/review.ts`)

```typescript
syncReviews(db, businessId, scrapedReviews[])  // → newly inserted review rows
listReviews(db, businessId)                    // → all stored reviews for the business
```

- `syncReviews` validates each review with Zod (userId, reviewerName, rating 1–5, postedAtRaw, postedAtIso, reviewText, fetchedAtIso required).
- `syncReviews` deduplicates by composite key: `businessId + userId + postedAtIso`. Dedup covers both existing DB rows and duplicates within the same batch.
- `listReviews` returns every stored review row for the business, scoped by `businessId`. Returns `[]` if the business has no reviews.
- Both functions throw `Business not found: N` if `businessId` does not exist.

### Scraper (`src/services/scraper.ts`)

```typescript
scrapeReviews(yelpUrl, maxPages)         // → ScrapedReview[]; orchestrates openclaw browser
parseReviewsFromSnapshot(snapshot)       // → ScrapedReview[]; pure parsing of snapshot text
findNextPageRef(snapshot)                // → string | null; finds "Next" link ref for pagination
extractTargetId(jsonOutput)              // → string | null; parses `openclaw browser open` output
extractTabIds(jsonOutput)                // → string[];      parses `openclaw browser tabs` output
```

All `openclaw browser` invocations go through a single `ocBrowser(args, timeoutMs)` helper that shells out with `execFileSync` (no shell — command injection safe) and a 30s default timeout.

**Orchestration flow (`scrapeReviews`):**

1. Verifies the `openclaw` CLI is installed; throws a helpful install hint if missing.
2. Normalizes the URL to `<yelpUrl>?sort_by=date_desc` (Newest First).
3. Snapshots existing browser tabs via `openclaw browser --json tabs` so it can later tell which tab(s) it opened.
4. Opens the URL (`openclaw browser open`), then re-reads the tab list and diffs to record the newly-opened tab IDs.
5. Waits for the text "Recommended Reviews" to appear (`openclaw browser wait --text …`, 15s page-load timeout).
6. For each page up to `maxPages`:
   - On pages after the first, takes a snapshot, locates the "Next" link ref with `findNextPageRef`, clicks it, and waits 3s for the next page to render. Breaks the loop if no Next link exists.
   - Takes a snapshot and runs `parseReviewsFromSnapshot` to extract review rows.
7. In a `finally` block, closes only the tabs that *this* invocation opened. The browser itself is intentionally left running so subsequent fetches (and user sessions) can reuse it — this avoids re-triggering DataDome CAPTCHAs.

**Output handling:** `openclaw` can print plugin banner lines on stdout before its JSON body. `stripNonJsonPrefix` trims everything up to the first `{` so `JSON.parse` can succeed. Both `extractTargetId` and `extractTabIds` use it.

**Snapshot parsing (`parseReviewsFromSnapshot`):** Splits the snapshot on `- region "…" [ref=…]:` markers, then for each region extracts:

| Field | Source regex |
|---|---|
| `userId` | `/user_details?userid=…` URL in the region |
| `reviewerName` | region title (must end with `.` — skips non-reviewer regions like "Username" or "Recommended Reviews") |
| `reviewerLocation` | `- generic` line matching `City, ST` pattern (nullable) |
| `rating` | `img "N star rating"` |
| `postedAtRaw` / `postedAtIso` | `- generic` line with a `Mon DD, YYYY` date, converted to `YYYY-MM-DD` |
| `reviewText` | `- paragraph` line content |

Any region missing `userId`, `rating`, date, or review text is skipped silently.

**Pagination parsing (`findNextPageRef`):** Matches `link "Next"(\s\[\w+\])*\s\[ref=…]`. The optional `\[\w+\]` group lets it match both `link "Next" [ref=…]` (first page) and `link "Next" [active] [ref=…]` (subsequent pages). It intentionally does not match `button "Next"`, which Yelp uses for the photo gallery.

## CLI Layer

Uses citty (unjs/citty). The root command is defined in `src/index.ts`. Commands are thin wiring — argument parsing, service calls, and JSON output. No business logic in command definitions.

### Commands

| Command | Output (stdout) | Errors (stderr) |
|---|---|---|
| `business add <name> <yelp-url>` | Created business JSON | Validation/duplicate errors |
| `business list` | JSON array of all businesses | — |
| `business remove <id>` | `{"removed":true,"id":N}` | "Business not found" / "ID must be a number" |
| `config get <key>` | `{"key":"...","value":"..."}` | "Unknown config key: ..." |
| `config set <key> <value>` | `{"key":"...","value":"..."}` | — |
| `fetch -b <id> [--pages N]` | JSON array of new reviews | "Business not found" / "openclaw CLI is not installed" |
| `reviews -b <id>` | JSON array of all stored reviews | "Business not found" / "Business ID must be a number" |

All CLI output goes as JSON on stdout. Human-readable error messages go on stderr.

## Planned Modules (Not Yet Built)

- **Response Service** — save/list draft responses
