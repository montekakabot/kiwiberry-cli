---
name: release-smoke-test
description: Dry-run the Kiwiberry release workflow end-to-end by tagging a throwaway rc release, verifying the GitHub Actions pipeline produces valid artifacts, smoke-testing install.sh against the real release, and cleaning up. Use when the user wants to validate the release pipeline before cutting a real version, mentions "smoke test the release", "rc tag", "dry run release", or "test release workflow".
---

# Release workflow smoke test

Validates `.github/workflows/release.yml` and `install.sh` end-to-end against a throwaway release candidate tag **without** cutting a real version. Covers what the unit tests in `test/install-sh.test.ts` cannot:

- The real `softprops/action-gh-release@v2` upload + `generate_release_notes`
- GitHub's `releases/latest/download/...` redirect chain with actual `curl -fsSL`
- Whether ubuntu `sha256sum` output format matches `install.sh`'s awk parser on real asset names
- Whether the cross-compiled binaries run on the host after being tarred, uploaded, downloaded, extracted
- macOS Gatekeeper behavior on the darwin binary

## When to run this

- Before cutting a real release (`v0.2.0`, `v0.3.0`, etc.) if the release workflow or `install.sh` has changed since the last successful real release
- After touching `.github/workflows/release.yml`, `install.sh`, `package.json` build scripts, or `src/db/migrations.ts` (which affects binary bundling)
- Not needed for unrelated code changes — the pipeline doesn't change on every PR

## Preconditions (check before starting)

Run these in parallel and confirm each:

- [ ] `git rev-parse --abbrev-ref HEAD` → `main`
- [ ] `git status --porcelain` → empty (clean working tree)
- [ ] `git fetch origin && git rev-list --count HEAD..origin/main` → `0` (up to date)
- [ ] `gh auth status` → authenticated
- [ ] `bun test` → all pass (fast sanity check; release workflow runs this too)

If any precondition fails, stop and report to the user. Do not try to "fix" a dirty tree or an out-of-date branch without their confirmation.

## Pick an rc tag name

Default to `v0.0.0-rc1`. If that tag already exists (locally or remote), increment the suffix:

```bash
git ls-remote --tags origin 'v0.0.0-rc*'
```

Pick the next free `v0.0.0-rcN`. `v0.0.0-*` is deliberately outside the real semver range so nobody mistakes it for a shippable version in the tag list.

## Steps

Track each step with TaskCreate so the user can see progress. Mark complete as you go.

### 1. Tag and push

```bash
git tag -a v0.0.0-rcN -m "Release workflow smoke test"
git push origin v0.0.0-rcN
```

Pushing a `v*` tag fires `.github/workflows/release.yml`.

### 2. Watch the workflow

```bash
gh run watch
```

`gh run watch` blocks until the most recent run finishes and prints the outcome. If it fails:

1. Read the failing step's logs: `gh run view --log-failed`
2. Diagnose the root cause — don't just retry
3. Fix on `main` via a normal PR (do not amend the tag)
4. Delete the failed tag and release (see cleanup)
5. Re-tag as `v0.0.0-rc(N+1)` and repeat

Common failure classes to watch for:
- Test or lint failure (should be caught by local `bun test` precondition, but the runner environment differs)
- `bun run build:all` cross-compile failure for one target
- Packaging step failing on `cp`/`tar`/`zip` — often a missing binary means a build target silently produced nothing
- `action-gh-release@v2` failing with `fail_on_unmatched_files` — a packaged archive is missing from the upload list
- Permission errors — check `permissions: contents: write` is still on the job

### 3. Verify release assets landed

```bash
gh release view v0.0.0-rcN
```

Confirm all 6 assets are present:
- `kiwiberry-darwin-arm64.tar.gz`
- `kiwiberry-darwin-x64.tar.gz`
- `kiwiberry-linux-x64.tar.gz`
- `kiwiberry-linux-arm64.tar.gz`
- `kiwiberry-windows-x64.zip`
- `SHA256SUMS`

Spot-check `SHA256SUMS` format:

```bash
gh release download v0.0.0-rcN --pattern SHA256SUMS --output /tmp/SHA256SUMS-rcN
cat /tmp/SHA256SUMS-rcN
```

Each line should be `<64 hex chars><two spaces><filename>`. If the separator isn't two spaces, `install.sh`'s awk parser (`$2 == asset`) may break — investigate before shipping.

### 4. Smoke-test install.sh against the real release

Use a unique temp dir so the smoke test never collides with a real install in `~/.local/bin`.

**Path A: direct script invocation (fastest, exercises file://-free download path):**

```bash
SMOKE_DIR="/tmp/kiwiberry-rc-smoke-$$"
KIWIBERRY_VERSION=v0.0.0-rcN \
KIWIBERRY_INSTALL_DIR="$SMOKE_DIR" \
  bash install.sh
```

**Path B: curl | bash (exercises the exact flow a new user sees):**

```bash
SMOKE_DIR_CURL="/tmp/kiwiberry-rc-smoke-curl-$$"
curl -fsSL https://raw.githubusercontent.com/montekakabot/kiwiberry-cli/main/install.sh | \
  KIWIBERRY_VERSION=v0.0.0-rcN KIWIBERRY_INSTALL_DIR="$SMOKE_DIR_CURL" bash
```

Note the env vars go **after** the pipe, scoped to `bash`, not to `curl`. Setting them before `curl` scopes them to the curl process and they never reach the install script — the script then defaults to `latest` and `~/.local/bin`, silently polluting the user's real install directory.

Both should print `Downloading ...`, `Fetching .../SHA256SUMS`, `Checksum verified.`, and `Installed kiwiberry → ...`.

On macOS, clear the quarantine flag on the installed binary once (the skill runs on Darwin by default):

```bash
xattr -d com.apple.quarantine "$SMOKE_DIR/kiwiberry" 2>/dev/null || true
```

### 5. Exercise the binary

```bash
"$SMOKE_DIR/kiwiberry" --version
"$SMOKE_DIR/kiwiberry" --help
```

`--version` must print a version string (currently tracks `package.json`). Then do a minimum end-to-end check against an isolated DB directory — **never** run against `~/.kiwiberry`:

```bash
KIWIBERRY_DB_DIR="$SMOKE_DIR/data" "$SMOKE_DIR/kiwiberry" business list
```

`KIWIBERRY_DB_DIR` is wired through `defaultDataDir()` in `src/db/index.ts` and every command respects it. If a future refactor breaks that wiring, verify the isolated dir actually got created (`ls "$SMOKE_DIR/data"`) before trusting the output; an empty stdout with a missing dir means the binary fell back to `~/.kiwiberry` and you've just touched the user's real database. Stop and ask the user if that happens.

A fresh DB + `business list` should return `[]` on stdout with no errors on stderr, and `$SMOKE_DIR/data/kiwiberry.db` should exist afterward. That proves:
- The binary starts
- Bundled migrations apply against a brand-new SQLite file
- JSON-on-stdout contract holds

### 6. Cleanup

**Only after the user confirms the smoke test looks good.** Do not cleanup on your own judgment — the rc artifacts may be useful for debugging if anything looked off.

```bash
gh release delete v0.0.0-rcN --yes --cleanup-tag
git tag -d v0.0.0-rcN 2>/dev/null || true
git fetch --prune --prune-tags origin

rm -rf "$SMOKE_DIR" "$SMOKE_DIR_CURL"
```

`--cleanup-tag` removes the remote tag. The local `git tag -d` and `git fetch --prune-tags` make sure the local ref is gone too.

### 7. Report to user

Summarize:
- Tag name used
- Workflow run URL
- Which assets were published
- Binary version string + any unexpected stderr from the smoke test
- Confirmation that cleanup is done (or that the rc is still around and why)

## Red flags — stop and ask the user

- Any precondition (dirty tree, wrong branch, not up to date) — **do not** "clean up" their work
- Workflow fails more than twice with different errors — there may be a deeper issue; escalate
- `SHA256SUMS` format differs from what the awk parser expects — this is a bug; fix before shipping
- Binary crashes, segfaults, or prints non-JSON to stdout — stop, do not cleanup, leave artifacts for diagnosis
- Any step tries to modify `~/.kiwiberry` (the user's real database) without their explicit OK

## Non-goals

- **Cutting a real release.** That's `docs/releasing.md`. The smoke test is `v0.0.0-rcN` only.
- **Testing linux/windows binaries on macOS.** Only the host-platform binary is actually executed. Cross-platform runtime validation requires real hardware or CI matrix jobs — out of scope here.
- **Retrying transient infra failures blindly.** Diagnose before re-tagging.
