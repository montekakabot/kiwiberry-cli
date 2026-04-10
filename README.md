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

Once installed, the binary is available as `kiwiberry`. All commands print JSON on stdout; human-readable status and errors go to stderr, so you can pipe output into `jq` or redirect it safely.

```bash
kiwiberry --help                  # Top-level help
kiwiberry <command> --help        # Help for a specific command
```

Subcommands: `business`, `config`, `fetch`, `reviews`, `respond`, `responses`.

### Typical workflow

Register a business, pull its latest reviews, then draft a reply to one:

```bash
# 1. Register the business (use the canonical Yelp biz URL)
kiwiberry business add "Meet Fresh" "https://www.yelp.com/biz/meet-fresh-temple-city"
# → {"id":1,"name":"Meet Fresh","yelpUrl":"https://www.yelp.com/biz/meet-fresh-temple-city","createdAt":"2026-04-10 09:12:00"}

# 2. Fetch the first 2 pages of reviews (new reviews only)
kiwiberry fetch -b 1 --pages 2
# → [{"id":12,"businessId":1,"author":"Jane D.","rating":5,"text":"Best taro milk tea...","postedAt":"2026-04-09"}]

# 3. List everything we've stored for that business
kiwiberry reviews -b 1 | jq '.[] | {id, rating, author}'

# 4. Draft a response to a specific review
kiwiberry respond 12 "Thanks Jane — we're glad you loved the taro!"
# → {"id":1,"reviewId":12,"text":"Thanks Jane — we're glad you loved the taro!","createdAt":"2026-04-10 09:15:00"}

# 5. Review drafts you've written for that review
kiwiberry responses 12
```

### Manage businesses

```bash
# Register a business
kiwiberry business add "Meet Fresh" "https://www.yelp.com/biz/meet-fresh-temple-city"

# List all tracked businesses
kiwiberry business list
# → [{"id":1,"name":"Meet Fresh","yelpUrl":"https://www.yelp.com/biz/meet-fresh-temple-city","createdAt":"2026-04-10 09:12:00"}]

# Remove a business (cascades to its reviews and draft responses)
kiwiberry business remove 1
# → {"removed":true,"id":1}
```

Validation rules:

- Business name must be non-empty
- Yelp URL must be a valid URL
- Duplicate Yelp URLs are rejected

```bash
kiwiberry business add "" "https://www.yelp.com/biz/test"         # stderr: Validation error
kiwiberry business add "Test" "not-a-url"                         # stderr: Validation error
kiwiberry business add "Shop B" "https://www.yelp.com/biz/shop"   # stderr: A business with this Yelp URL is already registered
```

### Fetch reviews

Requires the [OpenClaw](https://openclaw.dev/) browser CLI on `PATH`. Scrapes the business page, inserts any reviews not already in the database, and prints the newly added rows.

```bash
# Use the default page count from config (max-pages, defaults to 2)
kiwiberry fetch -b 1

# Override just for this run
kiwiberry fetch -b 1 --pages 5
```

### List stored reviews

```bash
kiwiberry reviews -b 1
# → [{"id":12,"businessId":1,"author":"Jane D.","rating":5,"text":"...","postedAt":"2026-04-09"}, ...]
```

### Draft responses

Pass the text inline, or pipe it in from stdin (handy for multi-line replies or generated drafts):

```bash
# Inline
kiwiberry respond 12 "Thanks for the kind words!"

# From stdin
cat reply.txt | kiwiberry respond 12

# List every draft saved for a review
kiwiberry responses 12
# → [{"id":1,"reviewId":12,"text":"Thanks for the kind words!","createdAt":"2026-04-10 09:15:00"}]
```

### Configuration

Config lives in the same SQLite database. `max-pages` controls how many Yelp review pages `fetch` scrapes when `--pages` is not passed.

```bash
# Read a value (defaults apply if it's never been set)
kiwiberry config get max-pages
# → {"key":"max-pages","value":"2"}

# Change it
kiwiberry config set max-pages 5
# → {"key":"max-pages","value":"5"}

# Unknown keys error out
kiwiberry config get foo
# stderr: Unknown config key: foo
```

## Data storage

Data is stored in `~/.kiwiberry/kiwiberry.db` (SQLite). The database and directory are created automatically on first use. To start fresh, delete that file.

## Uninstall

Kiwiberry does not install anything outside the binary and its data directory, so removing it is two `rm` commands:

```bash
# 1. Remove the binary (adjust the path if you installed it elsewhere)
rm ~/.local/bin/kiwiberry

# 2. Remove the database and any config (WARNING: this deletes every
#    tracked business, review, and draft response)
rm -rf ~/.kiwiberry
```

If you installed from source, also delete the cloned repo directory. If you set a custom `KIWIBERRY_INSTALL_DIR` during install, remove `kiwiberry` from that directory instead of `~/.local/bin`.

Keep `~/.kiwiberry` if you plan to reinstall — the new binary will pick up the existing database on first run.

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

See [docs/releasing.md](docs/releasing.md) for the full checklist, rollback procedure, and workflow details. Short version:

```bash
git tag v0.2.0
git push origin v0.2.0
```

Pushing a `v*` tag triggers `.github/workflows/release.yml`, which runs tests + lint, cross-compiles all 5 targets, packages each binary with the README into a `tar.gz` (or `zip` on Windows), writes `SHA256SUMS`, and uploads everything to a GitHub Release.

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
