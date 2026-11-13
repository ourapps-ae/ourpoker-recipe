#!/usr/bin/env bash
# Usage: bash scripts/build-windows.sh <new-output-dir> [<version>]
# The unsigned Windows installer: the web client's type check, the desktop tests and the x64 NSIS package, copied into the
# output folder with its evidence. On Windows, scripts/inspect-windows.ps1 then installs it silently, starts the installed
# application, checks its window loads and uninstalls it; elsewhere it is a cross-build and only the executable's header is
# checked.
set -euo pipefail
[[ ($# == 1 || $# == 2) && ! -e "$1" && -d "$(dirname "$1")" ]] || { echo "Expected a new output directory whose parent exists, and optionally a version" >&2; exit 2; }
VERSION="${2:-0.0.0}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Invalid version $VERSION" >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PYTHON="$(command -v python3 || command -v python)"
mkdir "$1"
OUT="$(cd "$1" && pwd)"
STATUS=failed
trap 'printf "%s\n" "$STATUS" > "$OUT/status.txt"' EXIT
APPLICATION=$("$PYTHON" -c 'import json, sys; print(json.load(open(sys.argv[1]))["id"])' "$ROOT/release/app.json")
NAME=$("$PYTHON" -c 'import json, sys; print(json.load(open(sys.argv[1]))["name"])' "$ROOT/release/app.json")
cd "$ROOT/web"
npm run typecheck 2>&1 | tee "$OUT/web-types.log"
cd "$ROOT/desktop"
npm run check 2>&1 | tee "$OUT/desktop-check.log"
rm -f artifacts/package-evidence.json
APP_VERSION="$VERSION" VITE_APP_VERSION="$VERSION" CSC_IDENTITY_AUTO_DISCOVERY=false npm run package:win 2>&1 | tee "$OUT/package.log"
# The package script writes its evidence last, after checking what it packed.
[[ -f artifacts/package-evidence.json ]] || { echo "Packaging did not finish; see package.log" >&2; exit 1; }
if [[ "${OS:-}" == Windows_NT ]]; then
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$ROOT/scripts/inspect-windows.ps1" -Desktop "$ROOT/desktop" -Output "$OUT" -Application "$APPLICATION" -Name "$NAME"
  STATUS=unsigned-installed-started-uninstalled
else
  "$PYTHON" "$ROOT/components/ourapps-release/server/scripts/platform_artifacts.py" record-windows "$ROOT/desktop" "$OUT" "$APPLICATION" "$NAME.exe"
  STATUS=cross-build-only
fi
