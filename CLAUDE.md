# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Kiwiberry CLI is a command-line tool that scrapes Yelp reviews for small businesses, stores them in a local SQLite database, and provides a workflow for drafting responses. All output is JSON on stdout, human messages on stderr.

## Commands

```bash
bun run dev              # Run the CLI (bun run src/index.ts)
bun test                 # Run all tests
bun test test/db.test.ts # Run a single test file
bun run lint             # ESLint with typescript-eslint strict type-checking
bun run lint -- --fix    # Auto-fix lint issues
bunx drizzle-kit generate # Generate migration after schema changes
```

[Architecture](docs/architecture.md)

[Testing](docs/testing.md)

[Releasing](docs/releasing.md)

## Key Conventions

- Runtime: Bun.js. Use `bun:sqlite` driver with `drizzle-orm`.
- CLI framework: citty (unjs/citty). Commands are thin wiring — no business logic in command definitions.
- All CLI output as JSON on stdout; status messages on stderr.
- Tests use real temp SQLite databases, no mocks. Test through public interfaces.
- ESLint config: strict type-checked rules, double quotes, 2-space indent, no trailing commas, semicolons required.

## Rules

- Always create a new feature branch before working on a new issue
- Always run `bun test` and `bun lint` before you open a new PR
- When implementing Yelp scraping logic, ensure all data is extracted from the business page URL (e.g., https://www.yelp.com/biz/meet-fresh-temple-city?osq=meet+fresh).