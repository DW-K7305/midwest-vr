#!/usr/bin/env bash
# Re-compiles MidWest-VR.app after you change the source. Most users never need this.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"
chmod +x "${SCRIPT_DIR}"/*.command "${SCRIPT_DIR}/bootstrap.sh" "${SCRIPT_DIR}/build-portable.sh" 2>/dev/null || true

clear || true
printf "\033]0;MidWest-VR — Rebuild\007"
echo
printf "\033[1;36m▸ Rebuilding MidWest-VR.app\033[0m\n"
echo "(2-4 minutes — incremental compile.)"
echo

if ! "${SCRIPT_DIR}/build-portable.sh"; then
  printf "\033[1;31m✗ Build failed. Scroll up for the red line that explains why.\033[0m\n"
  read -r -p "Press Return to close this window."
  exit 1
fi

printf "\n\033[1;32m✓ Done. MidWest-VR.app has been replaced with the new build.\033[0m\n\n"
read -r -p "Press Return to close this window."
