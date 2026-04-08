# Architecture

## Structure

```
src/
  index.ts          — citty root command entrypoint
  db/
    schema.ts       — Drizzle ORM schema (4 tables)
    index.ts        — getDatabase(dataDir) auto-init + migrations
test/
  db.test.ts        — database layer tests
drizzle/
  0000_*.sql        — generated migration SQL (committed to git)
```

## Database Layer

### Public Interface

```typescript
getDatabase(dataDir: string): BunSQLiteDatabase
```

Takes a directory path, creates it if missing, opens SQLite with WAL mode + foreign keys enabled, runs all pending Drizzle migrations, and returns a Drizzle DB instance.

The production data directory is `~/.kiwiberry/`, with the DB file at `~/.kiwiberry/kiwiberry.db`. This isn't wired to the CLI yet — `getDatabase` is not called on command invocation.

### Schema

| Table | Key Columns | Relationships |
|---|---|---|
| `businesses` | id, name, yelp_url, created_at | — |
| `reviews` | id, business_id, reviewer_name, reviewer_location, rating, posted_at_raw, posted_at_iso, review_text, review_url (unique), fetched_at_iso, location_name | FK → businesses (CASCADE) |
| `draft_responses` | id, review_id, response_text, created_at | FK → reviews (CASCADE) |
| `config` | key (PK), value | — |

Cascade deletes: removing a business deletes its reviews, which in turn deletes their draft responses.

## CLI Layer

Uses citty (unjs/citty). The root command is defined in `src/index.ts` with no subcommands yet. Future commands (business, fetch, reviews, respond, config) will be thin wiring — argument parsing, service calls, and JSON output. No business logic in command definitions.

All CLI output goes as JSON on stdout. Human-readable status messages go on stderr.

## Planned Modules (Not Yet Built)

- **Business Service** — CRUD for businesses table
- **Review Service** — sync logic, dedup by review_url
- **Response Service** — save/list draft responses
- **Config Service** — key-value get/set with defaults
- **Scraper** — shells out to OpenClaw browser CLI to scrape Yelp pages
