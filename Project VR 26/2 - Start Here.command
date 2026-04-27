#!/usr/bin/env bash
# Double-click this file from Finder. It runs first-time setup:
#   - installs the build tools your Mac needs (one time)
#   - downloads adb (the headset interface)
#   - compiles MidWest-VR.app
#   - places MidWest-VR.app next to this file so you can double-click it
#
# About 10 minutes total. Watch the colored output for progress.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# Make every .command in this folder executable in case Finder dropped the bit.
chmod +x "${SCRIPT_DIR}"/*.command 2>/dev/null || true
chmod +x "${SCRIPT_DIR}/bootstrap.sh" "${SCRIPT_DIR}/build-portable.sh" 2>/dev/null || true

# Make the terminal window readable.
clear || true
printf "\033]0;MidWest-VR — First-time Setup\007"

cat <<'BANNER'

  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║              MidWest-VR — First-time Setup                   ║
  ║                                                              ║
  ║   ⚠  This installs developer tools on THIS Mac:              ║
  ║        - Xcode Command Line Tools (Apple, ~3 GB)             ║
  ║        - Homebrew (asks for your admin password)             ║
  ║        - Node.js, pnpm, Rust, Tauri CLI (~1 GB)              ║
  ║                                                              ║
  ║   ✗  DO NOT run this on a work / school / managed Mac        ║
  ║      where you don't own the admin password or where IT      ║
  ║      policy forbids developer tools.                         ║
  ║                                                              ║
  ║   ✓  DO run this on your personal Mac (or any Mac you have   ║
  ║      permission to install software on). After Setup, the    ║
  ║      compiled MidWest-VR.app on the SSD will run on your     ║
  ║      work Mac with no admin and no Terminal.                 ║
  ║                                                              ║
  ║   Total time: about 10 minutes. You can leave this running.  ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝

BANNER

# ---- Confirm we should proceed ----
printf "Type \033[1mYES\033[0m and Return to confirm this Mac is OK to install developer tools on.\n"
printf "Anything else cancels.\n\n"
read -r -p "> " CONFIRM
if [[ "${CONFIRM}" != "YES" ]]; then
  printf "\n\033[1;33mCancelled. No changes made to this Mac.\033[0m\n\n"
  read -r -p "Press Return to close this window."
  exit 0
fi
echo

# ---- Sanity: are we on macOS? ----
if [[ "$(uname -s)" != "Darwin" ]]; then
  printf "\033[1;31mThis only works on macOS. Aborting.\033[0m\n"
  read -r -p "Press Return to close this window."
  exit 1
fi

step() { printf "\n\033[1;36m▸ %s\033[0m\n" "$*"; }
ok()   { printf   "\033[1;32m✓ %s\033[0m\n" "$*"; }
fail() { printf   "\033[1;31m✗ %s\033[0m\n" "$*"; }

# ---- Run bootstrap (toolchain + adb) ----
step "Step 1 of 2: Installing build tools and downloading adb"
echo "(Xcode tools, Homebrew, Node, Rust, and Tauri CLI — one-time install.)"
echo
if ! "${SCRIPT_DIR}/bootstrap.sh"; then
  fail "Bootstrap failed. Look up the line above that ended in red."
  echo
  read -r -p "Press Return to close this window."
  exit 1
fi
ok "Build tools ready."

# ---- Run the compile ----
step "Step 2 of 2: Compiling MidWest-VR.app"
echo "(Rust will compile ~300 crates the first time — this is the slow step.)"
echo
if ! "${SCRIPT_DIR}/build-portable.sh"; then
  fail "Compile failed. Look up the line above that ended in red."
  echo
  read -r -p "Press Return to close this window."
  exit 1
fi

# ---- Done ----
APP="${SCRIPT_DIR}/MidWest-VR.app"
if [[ ! -d "${APP}" ]]; then
  fail "Build said it succeeded but MidWest-VR.app isn't here. Strange. Re-run me."
  read -r -p "Press Return to close this window."
  exit 1
fi

cat <<DONE

  ╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║                       ✅  Setup complete                      ║
  ║                                                              ║
  ║   MidWest-VR.app is now in this folder.                        ║
  ║   Double-click it (or "3 - Open MidWest-VR.command") to start. ║
  ║                                                              ║
  ║   You only had to do this once. Future launches are instant. ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝

DONE

# Reveal the app in Finder so they can see it landed.
open -R "${APP}" 2>/dev/null || true

read -r -p "Press Return to close this Terminal window."
