#!/usr/bin/env bash
# ima2-gen fork one-click installer (macOS / Linux)
#
# Usage:
#   curl -fsSL https://damagethundercat.github.io/ima2-gen/install-mac.sh | bash
#   bash install-mac.sh
#
# Flow:
#   1. Check Node.js
#   2. Install @damagethundercat/ima2-gen globally
#   3. Run ima2x serve

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
if npm install -g "$PKG_NAME"; then
  print "$PKG_NAME installed."
else
  fail "npm install failed. Check npm permissions or configure a user-level npm prefix."
fi

print "Starting ima2-gen fork with $CLI_NAME serve..."
print "If the browser does not open automatically, visit http://localhost:3333."
echo
exec "$CLI_NAME" serve
