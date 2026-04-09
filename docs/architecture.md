# Architecture

## Structure

```
src/
  index.ts            — citty root command entrypoint
  commands/
    business.ts       — business add/list/remove subcommands
  db/
    schema.ts         — Drizzle ORM schema (4 tables)
    index.ts          — getDatabase(dataDir) auto-init + migrations
  services/
    business.ts       — business CRUD with Zod validation
test/
  db.test.ts          — database layer tests
  business.test.ts    — business service tests
drizzle/
  0000_*.sql          — initial migration (tables)
  0001_*.sql          — add unique index on businesses.yelp_url
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
| `reviews` | id, business_id, reviewer_name, reviewer_location, rating, posted_at_raw, posted_at_iso, review_text, review_url, fetched_at_iso, location_name | review_url UNIQUE | FK → businesses (CASCADE) |
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

## CLI Layer

Uses citty (unjs/citty). The root command is defined in `src/index.ts`. Commands are thin wiring — argument parsing, service calls, and JSON output. No business logic in command definitions.

### Commands

| Command | Output (stdout) | Errors (stderr) |
|---|---|---|
| `business add <name> <yelp-url>` | Created business JSON | Validation/duplicate errors |
| `business list` | JSON array of all businesses | — |
| `business remove <id>` | `{"removed":true,"id":N}` | "Business not found" / "ID must be a number" |

All CLI output goes as JSON on stdout. Human-readable error messages go on stderr.

## Planned Modules (Not Yet Built)

- **Review Service** — sync logic, dedup by review_url
- **Response Service** — save/list draft responses
- **Config Service** — key-value get/set with defaults
- **Scraper** — shells out to OpenClaw browser CLI to scrape Yelp pages
