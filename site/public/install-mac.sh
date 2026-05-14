#!/usr/bin/env bash
# ima2-genX one-click installer (macOS / Linux)

set -euo pipefail

PKG_NAME="@damagethundercat/ima2-gen"
CLI_NAME="ima2x"

print() { printf '\033[1;36m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[1;33mWARN\033[0m %s\n' "$1"; }
fail()  { printf '\033[1;31mERR \033[0m %s\n' "$1" >&2; exit 1; }

if command -v node >/dev/null 2>&1; then
  print "Node.js detected: $(node --version)"
else
  warn "Node.js is not installed."
  if command -v brew >/dev/null 2>&1; then
    print "Installing Node.js LTS with Homebrew..."
    brew install node
  else
    fail "Install Node.js from https://nodejs.org, then run this script again."
  fi
fi

print "Installing $PKG_NAME globally..."
npm install -g "$PKG_NAME"

print "Starting ima2-genX with $CLI_NAME serve..."
exec "$CLI_NAME" serve
