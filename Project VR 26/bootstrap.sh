#!/usr/bin/env bash
# bootstrap.sh — one-shot Mac setup for MidWest-VR (Tauri 2 + React + Rust).
# Idempotent: safe to re-run. Skips anything already installed.
#
# Tested target: M4 MacBook Air, macOS Tahoe 26.4+
#
# What it does:
#   1. Xcode Command Line Tools
#   2. Homebrew
#   3. Node 22 + pnpm
#   4. Rustup + stable Rust + aarch64-apple-darwin target
#   5. Tauri CLI (cargo-binstall preferred for speed)
#   6. Downloads Google platform-tools adb into src-tauri/resources/adb-tools/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADB_DIR="${SCRIPT_DIR}/src-tauri/resources/adb-tools"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[1;32m%s\033[0m\n" "$*"; }
yellow(){ printf "\033[1;33m%s\033[0m\n" "$*"; }
red()   { printf "\033[1;31m%s\033[0m\n" "$*"; }

require_macos() {
  if [[ "$(uname -s)" != "Darwin" ]]; then
    red "MidWest-VR is macOS-only. Detected $(uname -s). Aborting."
    exit 1
  fi
  if [[ "$(uname -m)" != "arm64" ]]; then
    yellow "Warning: not on Apple Silicon (uname -m = $(uname -m)). The app is tuned for M-series Macs but should still build."
  fi
}

step() { echo; bold "==> $*"; }

# -------- 1. Xcode Command Line Tools --------
ensure_xcode_clt() {
  step "Xcode Command Line Tools"
  if xcode-select -p &>/dev/null; then
    green "Already installed at $(xcode-select -p)"
  else
    yellow "Installing Xcode CLT (this opens a GUI dialog — accept it, then re-run this script)."
    xcode-select --install || true
    exit 0
  fi
}

# -------- 2. Homebrew --------
ensure_brew() {
  step "Homebrew"
  if command -v brew &>/dev/null; then
    green "brew $(brew --version | head -n1 | awk '{print $2}') already installed"
  else
    yellow "Installing Homebrew (non-interactive)…"
    NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Apple Silicon brew lives at /opt/homebrew
    if [[ -x /opt/homebrew/bin/brew ]]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
  fi
}

# -------- 3. Node 22 + pnpm --------
ensure_node() {
  step "Node.js 22 + pnpm"
  if ! command -v node &>/dev/null || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]]; then
    brew install node@22
    brew link --overwrite --force node@22 || true
  else
    green "node $(node -v) already installed"
  fi
  if ! command -v pnpm &>/dev/null; then
    brew install pnpm
  else
    green "pnpm $(pnpm -v) already installed"
  fi
}

# -------- 4. Rust --------
ensure_rust() {
  step "Rustup + Rust stable + aarch64-apple-darwin"
  if ! command -v rustup &>/dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    # shellcheck disable=SC1091
    source "$HOME/.cargo/env"
  fi
  rustup default stable >/dev/null
  rustup target add aarch64-apple-darwin >/dev/null
  green "rustc $(rustc --version)"
}

# -------- 5. Tauri CLI --------
ensure_tauri_cli() {
  step "Tauri CLI"
  if cargo tauri --version &>/dev/null; then
    green "$(cargo tauri --version)"
    return
  fi
  if ! command -v cargo-binstall &>/dev/null; then
    cargo install cargo-binstall
  fi
  # Use binstall for speed (downloads prebuilt binary)
  cargo binstall -y tauri-cli@^2.0.0 || cargo install tauri-cli --version "^2.0.0"
  green "$(cargo tauri --version)"
}

# -------- 6. Bundled adb --------
ensure_adb() {
  step "Google platform-tools adb (for src-tauri/resources/adb-tools/)"
  if [[ -x "${ADB_DIR}/adb" ]]; then
    local v
    v="$("${ADB_DIR}/adb" version 2>/dev/null | head -n1 || true)"
    green "Already present: ${v}"
    return
  fi
  mkdir -p "${ADB_DIR}"
  local TMP
  TMP="$(mktemp -d)"
  local URL="https://dl.google.com/android/repository/platform-tools-latest-darwin.zip"
  yellow "Downloading $URL"
  curl -fL --retry 3 -o "${TMP}/pt.zip" "${URL}"
  unzip -q "${TMP}/pt.zip" -d "${TMP}"
  # Copy just what we need: adb + co-located libs.
  cp "${TMP}/platform-tools/adb" "${ADB_DIR}/adb"
  # adb on macOS is statically-ish linked but ship its sibling libs just in case.
  for lib in "${TMP}"/platform-tools/*.dylib; do
    [[ -e "$lib" ]] && cp "$lib" "${ADB_DIR}/" || true
  done
  chmod +x "${ADB_DIR}/adb"
  rm -rf "${TMP}"
  # Strip the quarantine attribute so it runs cleanly when bundled.
  xattr -cr "${ADB_DIR}" 2>/dev/null || true
  green "adb installed: $("${ADB_DIR}/adb" version | head -n1)"
}

# -------- 7. App icons --------
ensure_icons() {
  step "App icons"
  local ICON_DIR="${SCRIPT_DIR}/src-tauri/icons"
  mkdir -p "${ICON_DIR}"
  if [[ -f "${ICON_DIR}/icon.icns" && -f "${ICON_DIR}/32x32.png" ]]; then
    green "Icons already present"
    return
  fi
  # Generate a clean placeholder icon set. The user can replace icon.icns later.
  # We use Tauri CLI's icon generator if a source PNG is provided; otherwise we
  # synthesize a 1024x1024 PNG with sips + Python from a base SVG-like gradient.
  local SRC="${ICON_DIR}/_source.png"
  if [[ ! -f "${SRC}" ]]; then
    yellow "Generating placeholder source icon (1024x1024)…"
    /usr/bin/python3 - "$SRC" <<'PY'
import os, struct, zlib, sys
# Render a 1024x1024 dark-purple radial gradient PNG with a centered "VR" glyph mark.
W=H=1024
def chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t+d) & 0xffffffff)
import math
buf = bytearray()
cx, cy = W/2, H/2
for y in range(H):
    buf.append(0)  # filter byte
    for x in range(W):
        dx, dy = (x-cx)/cx, (y-cy)/cy
        d = math.sqrt(dx*dx+dy*dy)
        # Background gradient: deep indigo -> near-black at edges
        t = max(0.0, 1.0 - d)
        r = int(40 + 60*t)
        g = int(20 + 30*t)
        b = int(80 + 130*t)
        # Soft "headset" glyph: two darker rounded "lenses"
        for ox in (-0.22, 0.22):
            ddx = (x-(cx+ox*cx))/(cx*0.18)
            ddy = (y-cy)/(cy*0.18)
            if ddx*ddx + ddy*ddy < 1.0:
                r = int(r*0.35); g = int(g*0.35); b = int(b*0.55+40)
        buf.append(r); buf.append(g); buf.append(b)
sig = b"\x89PNG\r\n\x1a\n"
ihdr = struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0)
idat = zlib.compress(bytes(buf), 9)
png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
open(sys.argv[1], "wb").write(png)
print("source icon written")
PY
  fi
  # Use Tauri's icon generator (creates all required sizes + .icns).
  ( cd "${SCRIPT_DIR}" && cargo tauri icon "${SRC}" --output src-tauri/icons ) || {
    yellow "cargo tauri icon failed; falling back to manual sips conversion"
    sips -z 32 32     "${SRC}" --out "${ICON_DIR}/32x32.png"      >/dev/null
    sips -z 128 128   "${SRC}" --out "${ICON_DIR}/128x128.png"    >/dev/null
    sips -z 256 256   "${SRC}" --out "${ICON_DIR}/128x128@2x.png" >/dev/null
    sips -z 1024 1024 "${SRC}" --out "${ICON_DIR}/icon.png"       >/dev/null
    # Build .icns with iconutil
    local ICONSET="${ICON_DIR}/icon.iconset"
    rm -rf "${ICONSET}"; mkdir -p "${ICONSET}"
    sips -z 16 16     "${SRC}" --out "${ICONSET}/icon_16x16.png"      >/dev/null
    sips -z 32 32     "${SRC}" --out "${ICONSET}/icon_16x16@2x.png"   >/dev/null
    sips -z 32 32     "${SRC}" --out "${ICONSET}/icon_32x32.png"      >/dev/null
    sips -z 64 64     "${SRC}" --out "${ICONSET}/icon_32x32@2x.png"   >/dev/null
    sips -z 128 128   "${SRC}" --out "${ICONSET}/icon_128x128.png"    >/dev/null
    sips -z 256 256   "${SRC}" --out "${ICONSET}/icon_128x128@2x.png" >/dev/null
    sips -z 256 256   "${SRC}" --out "${ICONSET}/icon_256x256.png"    >/dev/null
    sips -z 512 512   "${SRC}" --out "${ICONSET}/icon_256x256@2x.png" >/dev/null
    sips -z 512 512   "${SRC}" --out "${ICONSET}/icon_512x512.png"    >/dev/null
    sips -z 1024 1024 "${SRC}" --out "${ICONSET}/icon_512x512@2x.png" >/dev/null
    iconutil -c icns "${ICONSET}" -o "${ICON_DIR}/icon.icns"
    rm -rf "${ICONSET}"
  }
  green "Icons ready in ${ICON_DIR}"
}

main() {
  require_macos
  ensure_xcode_clt
  ensure_brew
  ensure_node
  ensure_rust
  ensure_tauri_cli
  ensure_adb
  ensure_icons
  echo
  green "Bootstrap complete."
  echo
  bold "Next:"
  echo "  pnpm install"
  echo "  pnpm tauri dev"
}

main "$@"
