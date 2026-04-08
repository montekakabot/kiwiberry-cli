# Testing

## Running Tests

```bash
bun test                 # all tests
bun test test/db.test.ts # single file
```

## Conventions

- Tests use real SQLite databases in temp directories — no mocks.
- Test through public interfaces, not implementation details.
- Each test creates its own temp dir via `makeTempDir()` and cleans up in `afterEach`.
- Assert on return values and observable behavior, not internal state.

## Current Tests (test/db.test.ts)

All tests exercise `getDatabase(dataDir)`:

| Test | What It Verifies |
|---|---|
| creates directory and returns a working database | `getDatabase` creates the data dir when it doesn't exist |
| migrations create all 4 tables that accept inserts | Inserts a row in each table (businesses, reviews, draft_responses, config) and reads it back |
| calling getDatabase twice on same path works without error | Idempotent — second call preserves existing data |
| deleting a business cascades to reviews and draft responses | FK cascade: deleting a business removes its reviews and their drafts |

## What to Test (per PRD)

- **Review Service** — dedup behavior, sync returns only new reviews
- **Business Service** — CRUD and cascade deletion
- **Config Service** — get/set, defaults, overwriting keys

## What Not to Test

- **CLI Commands** — thin wiring layer, validate manually
- **Scraper** — depends on external OpenClaw subprocess and live Yelp pages
