# Releasing

How to ship a new version of Kiwiberry CLI to users.

## TL;DR

```bash
# 1. Make sure main is green and you are on it
git checkout main && git pull

# 2. Bump the version in package.json (e.g. 0.1.0 → 0.2.0)
# 3. Commit the bump
git commit -am "Release v0.2.0"
git push

# 4. Tag and push — this triggers the release workflow
git tag v0.2.0
git push origin v0.2.0
```

The [`.github/workflows/release.yml`](../.github/workflows/release.yml) workflow takes over from there: tests → lint → cross-compile → package → upload.

## Versioning

Kiwiberry follows [Semantic Versioning](https://semver.org/):

| Bump  | When                                                    | Example        |
| ----- | ------------------------------------------------------- | -------------- |
| major | Breaking CLI/JSON/DB changes users must migrate for    | `1.0.0 → 2.0.0` |
| minor | New commands, flags, or backwards-compatible features  | `0.1.0 → 0.2.0` |
| patch | Bug fixes, doc updates, non-behavioral tweaks           | `0.1.0 → 0.1.1` |

Pre-1.0 the project is still under active design — minor bumps may include breaking changes, but we should note them prominently in the release notes.

Bump three places and keep them in lockstep:

1. `package.json` → `version`
2. `src/index.ts` → the `meta.version` field on the root command (what `kiwiberry --version` prints)
3. The git tag (`v0.2.0`) — must match the `package.json` version with a `v` prefix

## Pre-release checklist

Before tagging, verify locally:

- [ ] `bun test` passes
- [ ] `bun run lint` is clean
- [ ] `bun run build` produces a working host binary (`./dist/kiwiberry --version` prints the new version)
- [ ] `bun run build:all` cross-compiles every target without errors
- [ ] `package.json` `version` and `src/index.ts` `meta.version` match
- [ ] `CHANGELOG.md` or release notes draft summarizes what changed (optional but recommended)
- [ ] Any new config keys, CLI flags, or schema changes are documented in `docs/architecture.md` / `README.md`
- [ ] You are on `main`, clean working tree, ahead of origin by zero commits

A dry run:

```bash
bun test && bun run lint && bun run build:all && ls -lh dist/
```

## Cutting the release

From a clean `main`:

```bash
git checkout main
git pull --ff-only origin main

# Create an annotated tag (annotated > lightweight — carries author, date, and message)
git tag -a v0.2.0 -m "Release v0.2.0"

git push origin v0.2.0
```

Pushing a `v*` tag fires the release workflow. Watch it here:

```bash
gh run watch
```

Or in the browser: <https://github.com/montekakabot/kiwiberry-cli/actions/workflows/release.yml>

## What the workflow does

Defined in [`.github/workflows/release.yml`](../.github/workflows/release.yml). Every step runs on a single `ubuntu-latest` runner since Bun cross-compiles from any host:

1. **Checkout** the tagged commit.
2. **Setup Bun** (`oven-sh/setup-bun@v2`, latest).
3. **Install deps** via `bun install --frozen-lockfile`.
4. **Run `bun test`** — release fails if any test fails.
5. **Run `bun run lint`** — release fails on lint errors.
6. **Cross-compile** every target via `bun run build:all`, writing:
   - `dist/kiwiberry-darwin-arm64`
   - `dist/kiwiberry-darwin-x64`
   - `dist/kiwiberry-linux-x64`
   - `dist/kiwiberry-linux-arm64`
   - `dist/kiwiberry-windows-x64.exe`
7. **Package** each binary with `README.md` into a platform-appropriate archive under `release/`:
   - Unix targets → `kiwiberry-<target>.tar.gz` (binary renamed to plain `kiwiberry` inside the archive so `install.sh` can extract it at a stable path)
   - Windows → `kiwiberry-windows-x64.zip`
8. **Write `SHA256SUMS`** covering every archive.
9. **Upload** all archives + `SHA256SUMS` to a GitHub Release created for the tag, with auto-generated release notes (`generate_release_notes: true`).

If any step fails, the workflow aborts and no release is published — re-run after fixing.

## How users get the update

Once the workflow finishes, users pick up the new version via one of the paths documented in [README.md](../README.md#install):

- **Install script** — `curl ... install.sh | bash` always resolves `latest`, so a fresh run upgrades them. Pinned users run with `KIWIBERRY_VERSION=v0.2.0`.
- **Manual download** — the new archives appear at <https://github.com/montekakabot/kiwiberry-cli/releases>.
- **From source** — `git pull && bun run build`.

`install.sh` computes and verifies SHA256 against `KIWIBERRY_SHA256` when set, but does not yet auto-fetch `SHA256SUMS` from the release (see follow-up below).

## Post-release verification

After the workflow goes green:

```bash
# Smoke-test the install script against the fresh release
KIWIBERRY_INSTALL_DIR=/tmp/kiwiberry-verify-$$ \
  curl -fsSL https://raw.githubusercontent.com/montekakabot/kiwiberry-cli/main/install.sh | bash
/tmp/kiwiberry-verify-*/kiwiberry --version
```

Confirm the version printed matches the tag. If it doesn't, the `src/index.ts` bump got missed — follow the rollback procedure.

## Rollback

GitHub Releases can be edited or deleted after the fact. Steps:

1. **Delete the broken release and tag:**
   ```bash
   gh release delete v0.2.0 --yes --cleanup-tag
   ```
2. **Fix the bug on `main`** (regular PR flow).
3. **Cut a new patch release** (`v0.2.1`) — do not reuse the same tag. Reused tags confuse users who already downloaded the broken asset.

If users have already downloaded a broken release, pin them to the previous good version in release notes and the commit message of the follow-up fix.

## Follow-ups (not yet implemented)

Future improvements tracked as separate issues:

- Homebrew tap / formula (`brew install montekakabot/kiwiberry/kiwiberry`)
- npm binary wrapper package (`npm i -g kiwiberry`)
- Apple code-signing + notarization so macOS users don't need to clear the quarantine flag
- `install.sh` auto-fetching `SHA256SUMS` from the release so checksum verification happens by default, not just when `KIWIBERRY_SHA256` is provided
- `kiwiberry upgrade` subcommand
