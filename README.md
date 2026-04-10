# Kiwiberry CLI

A command-line tool that scrapes Yelp reviews for small businesses, stores them in a local SQLite database, and provides a workflow for drafting responses.

All output is JSON on stdout. Human-readable messages go to stderr.

## Prerequisites

- [OpenClaw](https://openclaw.dev/) browser CLI — required only for the `fetch` command
- [Bun](https://bun.sh/) v1.0+ — only needed if you install from source

## Install

### Install script (recommended)

One-liner that auto-detects your OS/arch, downloads the matching binary from the latest GitHub Release, verifies its SHA256 checksum, and drops it into `~/.local/bin`:

```bash
curl -fsSL https://raw.githubusercontent.com/montekakabot/kiwiberry-cli/main/install.sh | bash
```

Pin a specific release or change the install directory with env vars:

```bash
KIWIBERRY_VERSION=v0.2.0 KIWIBERRY_INSTALL_DIR=/usr/local/bin \
  curl -fsSL https://raw.githubusercontent.com/montekakabot/kiwiberry-cli/main/install.sh | bash
```

Make sure `~/.local/bin` (or your chosen dir) is on `PATH`.

### Manual download

Grab a prebuilt archive from [Releases](https://github.com/montekakabot/kiwiberry-cli/releases) for your platform:

| Platform       | Asset                                  |
| -------------- | -------------------------------------- |
| macOS arm64    | `kiwiberry-darwin-arm64.tar.gz`        |
| macOS Intel    | `kiwiberry-darwin-x64.tar.gz`          |
| Linux x86\_64  | `kiwiberry-linux-x64.tar.gz`           |
| Linux arm64    | `kiwiberry-linux-arm64.tar.gz`         |
| Windows x86\_64 | `kiwiberry-windows-x64.zip`           |

Verify against `SHA256SUMS` published on the release, extract, and place `kiwiberry` somewhere on `PATH`.

**macOS Gatekeeper:** the binary is unsigned, so macOS will block it with "unidentified developer" on first launch. Clear the quarantine flag once:

```bash
xattr -d com.apple.quarantine ~/.local/bin/kiwiberry
```

### From source

```bash
git clone https://github.com/montekakabot/kiwiberry-cli.git
cd kiwiberry-cli
bun install
bun run build          # → dist/kiwiberry (host target only)
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
bun run build            # Compile a standalone binary → dist/kiwiberry (host target)
bun run build:all        # Cross-compile darwin/linux/windows targets into dist/
bunx drizzle-kit generate # Generate migration after schema changes
```

### Cutting a release

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which runs tests + lint, cross-compiles all 5 targets, packages each binary with the README into a `tar.gz` (or `zip` on Windows), writes a `SHA256SUMS` file, and uploads everything to a GitHub Release.

```bash
git tag v0.2.0
git push origin v0.2.0
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
