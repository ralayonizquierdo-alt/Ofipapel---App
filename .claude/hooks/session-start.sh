#!/bin/bash
set -euo pipefail

# Only provision this in Claude Code on the web / remote sessions —
# local machines should run the installer manually per the project README.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

INSTALL_DIR="$HOME/.local/bin"
BIN="$INSTALL_DIR/codebase-memory-mcp"

if command -v codebase-memory-mcp >/dev/null 2>&1 || [ -x "$BIN" ]; then
  exit 0
fi

# NOTE: deliberately does NOT run the upstream install.sh / `codebase-memory-mcp
# install` — that subcommand ignores its own --skip-config flag and rewrites
# global Claude Code config (mcpServers, hooks, skills) as a side effect. This
# fetches and places the binary only, so this project's own .claude/settings.json
# and .mcp.json remain the single source of truth.
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "codebase-memory-mcp: unsupported arch $ARCH, skipping" >&2; exit 0 ;;
esac

REPO="DeusData/codebase-memory-mcp"
BASE_URL="https://github.com/${REPO}/releases/latest/download"
ARCHIVE="codebase-memory-mcp-linux-${ARCH}-portable.tar.gz"

DLDIR="$(mktemp -d)"
trap 'rm -rf "$DLDIR"' EXIT

curl -fsSL "${BASE_URL}/${ARCHIVE}" -o "$DLDIR/$ARCHIVE"
curl -fsSL "${BASE_URL}/checksums.txt" -o "$DLDIR/checksums.txt"

EXPECTED="$(awk -v f="$ARCHIVE" '$2 == f { print $1 }' "$DLDIR/checksums.txt")"
ACTUAL="$(sha256sum "$DLDIR/$ARCHIVE" | awk '{ print $1 }')"
if [ -z "$EXPECTED" ] || [ "$EXPECTED" != "$ACTUAL" ]; then
  echo "codebase-memory-mcp: checksum verification failed, aborting install" >&2
  exit 1
fi

tar -xzf "$DLDIR/$ARCHIVE" -C "$DLDIR"
mkdir -p "$INSTALL_DIR"
install -m 755 "$DLDIR/codebase-memory-mcp" "$BIN"
