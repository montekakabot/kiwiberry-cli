# Architecture

## Structure

```
src/
  index.ts            — citty root command entrypoint
  commands/
    business.ts       — business add/list/remove subcommands
    config.ts         — config get/set subcommands
    fetch.ts          — fetch reviews for a business
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
drizzle/
  0000_*.sql          — initial migration (tables)
  0001_*.sql          — add unique index on businesses.yelp_url
  0002_*.sql          — replace review_url with user_id, add composite unique index
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
| `reviews` | id, business_id, user_id, reviewer_name, reviewer_location, rating, posted_at_raw, posted_at_iso, review_text, fetched_at_iso, location_name | UNIQUE(business_id, user_id, posted_at_iso) | FK → businesses (CASCADE) |
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
```

- Validates each review with Zod (userId, reviewerName, rating 1–5, postedAtRaw, postedAtIso, reviewText, fetchedAtIso required).
- Deduplicates by composite key: `businessId + userId + postedAtIso`.
- Dedup covers both existing DB rows and duplicates within the same batch.
- Throws if `businessId` does not exist.

### Scraper (`src/services/scraper.ts`)

```typescript
scrapeReviews(yelpUrl, maxPages)  // → ScrapedReview[]; shells out to openclaw browser
```

- Checks that `openclaw` CLI is installed; throws helpfully if missing.
- Navigates to the business Yelp URL with `?sort_by=date_desc` (Newest First).
- Takes an AI snapshot via `openclaw browser snapshot` and parses review data from the structured text output.
- Paginates by finding and clicking the "Next" link in the snapshot, up to `maxPages`.
- Uses `execFileSync` (no shell) to avoid command injection.

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

All CLI output goes as JSON on stdout. Human-readable error messages go on stderr.

## Planned Modules (Not Yet Built)

- **Response Service** — save/list draft responses
