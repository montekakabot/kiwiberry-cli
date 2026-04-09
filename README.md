# Kiwiberry CLI

A command-line tool that scrapes Yelp reviews for small businesses, stores them in a local SQLite database, and provides a workflow for drafting responses.

All output is JSON on stdout. Human-readable messages go to stderr.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+

## Install

```bash
git clone https://github.com/montekakabot/kiwiberry-cli.git
cd kiwiberry-cli
bun install
```

## Usage

```bash
bun run dev <command>
```

### Manage businesses

```bash
# Register a business
bun run dev business add "Meet Fresh" "https://www.yelp.com/biz/meet-fresh-temple-city"
# → {"id":1,"name":"Taco Palace","yelpUrl":"https://www.yelp.com/biz/taco-palace","createdAt":"2026-04-08 12:00:00"}

# List all businesses
bun run dev business list
# → [{"id":1,"name":"Taco Palace","yelpUrl":"https://www.yelp.com/biz/taco-palace","createdAt":"2026-04-08 12:00:00"}]

# Remove a business (cascades to reviews and draft responses)
bun run dev business remove 1
# → {"removed":true,"id":1}
```

### Manage configuration

```bash
# Get a config value (max-pages defaults to 2)
bun run dev config get max-pages
# → {"key":"max-pages","value":"2"}

# Set a config value
bun run dev config set max-pages 5
# → {"key":"max-pages","value":"5"}

# Get the updated value
bun run dev config get max-pages
# → {"key":"max-pages","value":"5"}

# Unknown keys return an error
bun run dev config get foo
# stderr: Unknown config key: foo
```

### Download reviews

```bash
bun run dev fetch -b 1 --pages 1
```

### Input validation

- Business name must be non-empty
- Yelp URL must be a valid URL
- Duplicate Yelp URLs are rejected

```bash
# Empty name
bun run dev business add "" "https://www.yelp.com/biz/test"
# stderr: Validation error

# Invalid URL
bun run dev business add "Test" "not-a-url"
# stderr: Validation error

# Duplicate URL
bun run dev business add "Shop A" "https://www.yelp.com/biz/shop"
bun run dev business add "Shop B" "https://www.yelp.com/biz/shop"
# stderr: A business with this Yelp URL is already registered
```

## Data storage

Data is stored in `~/.kiwiberry/kiwiberry.db` (SQLite). The database and directory are created automatically on first use. To start fresh, delete that file.

## Development

```bash
bun run dev              # Run the CLI
bun test                 # Run all tests
bun test test/db.test.ts # Run a single test file
bun run lint             # ESLint with strict type-checking
bun run lint -- --fix    # Auto-fix lint issues
bunx drizzle-kit generate # Generate migration after schema changes
```

## Project structure

```
src/
  index.ts            — CLI entrypoint
  commands/
    business.ts       — business add/list/remove subcommands
    config.ts         — config get/set subcommands
  db/
    schema.ts         — Drizzle ORM schema (4 tables)
    index.ts          — database init + migrations
  services/
    business.ts       — business CRUD with Zod validation
    config.ts         — config key-value get/set with defaults
test/
  db.test.ts          — database layer tests
  business.test.ts    — business service tests
  config.test.ts      — config service tests
drizzle/
  *.sql               — generated migration SQL
docs/
  architecture.md     — detailed architecture documentation
  testing.md          — testing conventions and coverage
```

## License

MIT
