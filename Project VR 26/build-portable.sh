#!/usr/bin/env bash
# build-portable.sh — Build a release MidWest-VR.app, ad-hoc sign it, strip
# quarantine, and (optionally) copy it to your external SSD.
#
# Usage:
#   ./build-portable.sh                          # build only, leaves .app under src-tauri/target/...
#   ./build-portable.sh "/Volumes/SandSpd-EX"       # also copies to /Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app
#   ./build-portable.sh "/Volumes/SandSpd-EX/MidWest-VR"  # any directory you want; the .app keeps its name

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Default destination: the folder this script lives in. So after a build, the
# user finds MidWest-VR.app sitting right next to "Start Here.command".
DEST="${1:-$SCRIPT_DIR}"
APP_NAME="MidWest-VR.app"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[1;32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[1;33m%s\033[0m\n" "$*"; }
red()   { printf "\033[1;31m%s\033[0m\n" "$*"; }

cd "${SCRIPT_DIR}"

# ----- Sanity -----
if ! command -v cargo &>/dev/null; then
  red "Rust toolchain missing. Run ./bootstrap.sh first."
  exit 1
fi
if ! command -v pnpm &>/dev/null; then
  red "pnpm missing. Run ./bootstrap.sh first."
  exit 1
fi
if [[ ! -x "src-tauri/resources/adb-tools/adb" ]]; then
  red "Bundled adb missing. Run ./bootstrap.sh to fetch it."
  exit 1
fi

# ----- Build -----
bold "==> Installing JS deps"
pnpm install --frozen-lockfile=false

bold "==> Building Tauri release for aarch64-apple-darwin"
pnpm tauri build --target aarch64-apple-darwin

# Tauri 2 places the .app at:
#   src-tauri/target/aarch64-apple-darwin/release/bundle/macos/MidWest-VR.app
APP_PATH="${SCRIPT_DIR}/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/${APP_NAME}"
if [[ ! -d "${APP_PATH}" ]]; then
  red "Built app not found at ${APP_PATH}"
  exit 1
fi
green "Built: ${APP_PATH}"

# ----- Ad-hoc sign + strip quarantine -----
bold "==> Ad-hoc signing (codesign --sign -)"
codesign --force --deep --sign - --options runtime --timestamp=none "${APP_PATH}"
green "Signed."

bold "==> Stripping quarantine"
xattr -dr com.apple.quarantine "${APP_PATH}" 2>/dev/null || true

# ----- Verify -----
bold "==> Verifying signature"
codesign --verify --deep --strict --verbose=2 "${APP_PATH}" 2>&1 | tail -n 3 || true

bold "==> spctl assessment (informational — ad-hoc apps still show as 'rejected')"
spctl --assess --type execute --verbose=4 "${APP_PATH}" 2>&1 | tail -n 3 || true

# ----- Copy to destination -----
if [[ ! -d "${DEST}" ]]; then
  red "Destination does not exist or is not a directory: ${DEST}"
  exit 1
fi
bold "==> Copying to ${DEST}/${APP_NAME}"
rm -rf "${DEST}/${APP_NAME}"
ditto "${APP_PATH}" "${DEST}/${APP_NAME}"
xattr -dr com.apple.quarantine "${DEST}/${APP_NAME}" 2>/dev/null || true
green "Copied. Launch with: open '${DEST}/${APP_NAME}'"
