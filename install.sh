#!/usr/bin/env bash
#
# Kiwiberry CLI installer.
#
# Detects the host platform, downloads the matching release asset from
# GitHub, verifies its SHA256 checksum, and installs the binary into
# ~/.local/bin.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/montekakabot/kiwiberry-cli/main/install.sh | bash
#
# Environment variables:
#   KIWIBERRY_VERSION         Release tag to install (default: latest)
#   KIWIBERRY_INSTALL_DIR     Directory to install into (default: ~/.local/bin)
#   KIWIBERRY_DOWNLOAD_URL    Override asset URL (for testing / mirrors)
#   KIWIBERRY_SHA256SUMS_URL  Override SHA256SUMS URL (for testing / mirrors)
#   KIWIBERRY_SHA256          Override expected SHA256 (skips SHA256SUMS fetch)
#   KIWIBERRY_OS              Override detected OS (for testing)
#   KIWIBERRY_ARCH            Override detected arch (for testing)

set -euo pipefail

REPO="montekakabot/kiwiberry-cli"
VERSION="${KIWIBERRY_VERSION:-latest}"
INSTALL_DIR="${KIWIBERRY_INSTALL_DIR:-$HOME/.local/bin}"

err() {
  printf 'error: %s\n' "$*" >&2
}

info() {
  printf '%s\n' "$*" >&2
}

detect_target() {
  local os arch
  os="${KIWIBERRY_OS:-$(uname -s)}"
  arch="${KIWIBERRY_ARCH:-$(uname -m)}"

  local os_slug arch_slug
  case "$os" in
    Darwin) os_slug="darwin" ;;
    Linux)  os_slug="linux" ;;
    *)
      err "unsupported OS: $os (supported: Darwin, Linux)"
      return 1
      ;;
  esac

  case "$arch" in
    arm64|aarch64) arch_slug="arm64" ;;
    x86_64)        arch_slug="x64" ;;
    *)
      err "unsupported arch: $arch (supported: arm64, aarch64, x86_64)"
      return 1
      ;;
  esac

  printf 'kiwiberry-%s-%s.tar.gz\n' "$os_slug" "$arch_slug"
}

resolve_url() {
  local asset="$1"
  if [ -n "${KIWIBERRY_DOWNLOAD_URL:-}" ]; then
    printf '%s\n' "$KIWIBERRY_DOWNLOAD_URL"
    return
  fi
  if [ "$VERSION" = "latest" ]; then
    printf 'https://github.com/%s/releases/latest/download/%s\n' "$REPO" "$asset"
  else
    printf 'https://github.com/%s/releases/download/%s/%s\n' "$REPO" "$VERSION" "$asset"
  fi
}

resolve_sums_url() {
  if [ -n "${KIWIBERRY_SHA256SUMS_URL:-}" ]; then
    printf '%s\n' "$KIWIBERRY_SHA256SUMS_URL"
    return
  fi
  if [ "$VERSION" = "latest" ]; then
    printf 'https://github.com/%s/releases/latest/download/SHA256SUMS\n' "$REPO"
  else
    printf 'https://github.com/%s/releases/download/%s/SHA256SUMS\n' "$REPO" "$VERSION"
  fi
}

expected_sum_for() {
  local sums_file="$1"
  local asset="$2"
  awk -v asset="$asset" '$2 == asset { print $1; found=1; exit } END { exit !found }' "$sums_file"
}

download() {
  local url="$1"
  local dest="$2"
  if [[ "$url" == file://* ]]; then
    cp "${url#file://}" "$dest"
    return
  fi
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url" -o "$dest"
  elif command -v wget >/dev/null 2>&1; then
    wget -q "$url" -O "$dest"
  else
    err "neither curl nor wget is available"
    return 1
  fi
}

sha256_of() {
  local file="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    err "no sha256 tool available (need sha256sum or shasum)"
    return 1
  fi
}

install_flow() {
  local asset url
  asset="$(detect_target)"
  url="$(resolve_url "$asset")"

  local workdir
  workdir="$(mktemp -d)"
  # shellcheck disable=SC2064
  trap "rm -rf '$workdir'" EXIT

  local archive="$workdir/$asset"
  info "Downloading $url"
  download "$url" "$archive"

  local actual expected
  actual="$(sha256_of "$archive")"

  if [ -n "${KIWIBERRY_SHA256:-}" ]; then
    expected="$KIWIBERRY_SHA256"
  else
    local sums_url sums_file
    sums_url="$(resolve_sums_url)"
    sums_file="$workdir/SHA256SUMS"
    info "Fetching $sums_url"
    if ! download "$sums_url" "$sums_file" 2>/dev/null; then
      err "could not download SHA256SUMS from $sums_url — refusing to install without checksum verification"
      return 1
    fi
    if ! expected="$(expected_sum_for "$sums_file" "$asset")"; then
      err "SHA256SUMS does not contain an entry for $asset — refusing to install"
      return 1
    fi
  fi

  if [ "$actual" != "$expected" ]; then
    err "checksum mismatch for $asset: expected $expected, got $actual"
    return 1
  fi
  info "Checksum verified."

  mkdir -p "$INSTALL_DIR"
  tar -xzf "$archive" -C "$workdir"

  local extracted="$workdir/kiwiberry"
  if [ ! -f "$extracted" ]; then
    err "archive did not contain a 'kiwiberry' binary"
    return 1
  fi
  chmod +x "$extracted"
  mv "$extracted" "$INSTALL_DIR/kiwiberry"

  info "Installed kiwiberry → $INSTALL_DIR/kiwiberry"
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) : ;;
    *) info "Note: $INSTALL_DIR is not in your PATH. Add it to your shell profile to run 'kiwiberry' directly." ;;
  esac
}

main() {
  case "${1:-}" in
    --print-target)
      detect_target
      exit $?
      ;;
    --print-url)
      local asset
      asset="$(detect_target)"
      resolve_url "$asset"
      exit 0
      ;;
    --print-sums-url)
      resolve_sums_url
      exit 0
      ;;
  esac

  install_flow
}

main "$@"
