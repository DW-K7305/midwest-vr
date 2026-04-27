#!/usr/bin/env bash
# Double-click to launch MidWest-VR. (You can also just double-click MidWest-VR.app
# directly — this file is a backup launcher in case Finder hides .app extensions.)

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP="${SCRIPT_DIR}/MidWest-VR.app"

if [[ ! -d "${APP}" ]]; then
  printf "\033[1;31mMidWest-VR.app isn't in this folder yet.\033[0m\n"
  printf "\nDouble-click \"2 - Start Here.command\" first to compile it.\n\n"
  read -r -p "Press Return to close."
  exit 1
fi

# Strip quarantine in case the .app crossed volumes since the last launch.
xattr -dr com.apple.quarantine "${APP}" 2>/dev/null || true
open "${APP}"
