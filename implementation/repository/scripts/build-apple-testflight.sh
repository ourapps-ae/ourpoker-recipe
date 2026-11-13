#!/usr/bin/env bash
# Usage: bash scripts/build-apple-testflight.sh <macos|tvos> <version> <build> <new-output-dir>
# The Mac or Apple TV build for TestFlight, exported for App Store Connect with a temporary keychain filled from the store's
# signing answer; nothing Apple lives in the repository. It needs the Apple signing helpers apple-testflight.py and
# apple-testflight-upload.py beside the release scripts (components/ourapps-release/server/scripts) and ios/build-platform.sh;
# without them it stops before any output, signing material or store call.
set -euo pipefail
umask 077
[[ $# == 4 ]] || { echo 'Expected platform, version, build and output directory' >&2; exit 2; }
PLATFORM="$1"; VERSION="$2"; BUILD="$3"
case "$PLATFORM" in macos|tvos) ;; *) echo 'Use macos or tvos' >&2; exit 2 ;; esac
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$BUILD" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid version/build' >&2; exit 2; }
[[ ! -e "$4" && -d "$(dirname "$4")" ]] || { echo 'Expected new output with existing parent' >&2; exit 2; }
: "${STORE_APP_ID:?Store app identifier required}"
: "${STORE_BUILD_TOKEN:?Store build token required}"
: "${STORE_API:?Store address required}"
[[ "$STORE_APP_ID" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'Invalid store identifier' >&2; exit 2; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS="$ROOT/components/ourapps-release/server/scripts"
HELPERS="$SCRIPTS"
for needed in "$HELPERS/apple-testflight.py" "$HELPERS/apple-testflight-upload.py" "$ROOT/ios/build-platform.sh"; do
  [[ -f "$needed" ]] || { echo "Mac and Apple TV TestFlight builds need ${needed#"$ROOT"/}, which this application does not have." >&2; exit 1; }
done
# The switch is read before any output, store call or signing material exists.
python3 "$SCRIPTS/release_targets.py" require "$PLATFORM"
BUNDLE=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["bundleId"])' "$ROOT/release/app.json")
mkdir "$4"
OUT="$(cd "$4" && pwd)"
WORK="$(mktemp -d "$OUT/.signing.XXXXXX")"
KC="$WORK/build.keychain-db"
STATUS=failed
PHASE=source-preflight
cleanup() {
  RESULT=$?
  set +e
  CLEANUP_FAILED=0
  if [[ -f "$WORK/profile-state.json" ]]; then python3 "$HELPERS/apple-testflight.py" profile remove "$WORK/inputs.json" "$WORK/profile-state.json" || CLEANUP_FAILED=1; fi
  if [[ -f "$WORK/keychains.json" ]]; then python3 "$HELPERS/apple-testflight.py" keychain restore "$WORK/keychains.json" "$KC" || CLEANUP_FAILED=1; fi
  if [[ -f "$KC" ]]; then security delete-keychain "$KC" >/dev/null 2>&1 || CLEANUP_FAILED=1; fi
  rm -rf "$WORK"
  if [[ "$CLEANUP_FAILED" == 1 ]]; then STATUS=cleanup-failed; RESULT=1; fi
  python3 "$HELPERS/apple-testflight.py" result "$OUT/result.json" "$PLATFORM" "$PHASE" "$STATUS" "$RESULT"
  printf '%s\n' "$STATUS" > "$OUT/status.txt"
  exit "$RESULT"
}
trap cleanup EXIT
(cd "$ROOT/ios" && node generate-project.ts)
xcodegen dump --spec "$ROOT/ios/project.yml" --type json --file "$WORK/spec.json" --quiet
python3 "$HELPERS/apple-testflight.py" source-preflight "$PLATFORM" "$WORK/spec.json" "$ROOT/ios"
PREFIX=$(sed -nE 's/.*DEVELOPMENT_TEAM: "\$\(([A-Z0-9_]+)_TEAM\)".*/\1/p' "$ROOT/ios/project.yml" | head -1)
[[ -n "$PREFIX" ]] || { echo 'project.yml names no signing team variable' >&2; exit 1; }
API="$STORE_API/api/build/$STORE_APP_ID/$PLATFORM"
PHASE=service-signing-readiness
curl --fail --silent --show-error --head -H "Authorization: Bearer $STORE_BUILD_TOKEN" "$API/signing" > /dev/null
curl --fail --silent --show-error -H "Authorization: Bearer $STORE_BUILD_TOKEN" "$API/signing" > "$WORK/signing.json"
python3 "$HELPERS/apple-testflight.py" prepare "$PLATFORM" "$WORK/signing.json" "$WORK"
TEAM=$(jq -r .team "$WORK/inputs.json")
PROFILE=$(jq -r .profile "$WORK/inputs.json")
EXPORT_OPTIONS="$WORK/ExportOptions.plist"
INSTALLER_METADATA=""
if [[ "$PLATFORM" == macos ]]; then INSTALLER_METADATA="$WORK/installer-selector.json"; fi
export "${PREFIX}_TEAM=$TEAM" "${PREFIX}_PROFILE=$PROFILE" "${PREFIX}_EXPORT_OPTIONS=$EXPORT_OPTIONS" "${PREFIX}_PLATFORM_SIGNING=app-store"
if [[ -n "$INSTALLER_METADATA" ]]; then export "${PREFIX}_INSTALLER_METADATA=$INSTALLER_METADATA"; fi
python3 "$SCRIPTS/platform_artifacts.py" check-export "$PLATFORM" "$EXPORT_OPTIONS" "$TEAM" "$PROFILE" "$BUNDLE" "$INSTALLER_METADATA"
PHASE=temporary-signing-setup
PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')
security create-keychain -p "$PASSWORD" "$KC" > /dev/null
security set-keychain-settings -lut 21600 "$KC"
security unlock-keychain -p "$PASSWORD" "$KC"
python3 "$HELPERS/apple-testflight.py" keychain save "$WORK/keychains.json" "$KC"
for KIND in application installer; do
  [[ -f "$WORK/$KIND.pem" ]] || continue
  security import "$WORK/$KIND.pem" -k "$KC" -A > /dev/null
  security import "$WORK/$KIND.cer" -k "$KC" > /dev/null
done
security set-key-partition-list -S apple-tool:,apple: -s -k "$PASSWORD" "$KC" > /dev/null
unset PASSWORD
if [[ "$PLATFORM" == macos ]]; then
  PHASE=installer-identity
  python3 "$HELPERS/apple-testflight.py" installer-identity "$INSTALLER_METADATA" "$EXPORT_OPTIONS" "$KC" "$OUT/installer-identity.json"
fi
PHASE=temporary-signing-setup
python3 "$HELPERS/apple-testflight.py" profile install "$WORK/inputs.json" "$WORK/profile-state.json"
PHASE=archive-export
bash "$ROOT/ios/build-platform.sh" "$PLATFORM" "$VERSION" "$BUILD" "$OUT/build"
PHASE=export-verification
python3 "$HELPERS/apple-testflight.py" verify-export "$PLATFORM" "$OUT/build/export" "$VERSION" "$BUILD" "$TEAM" "$OUT/export-verification.json"
STATUS=exported-distribution-signatures-verified
if [[ "${TESTFLIGHT_UPLOAD:-false}" == true ]]; then
  PHASE=upload-commit
  python3 "$HELPERS/apple-testflight-upload.py" "$PLATFORM" "$STORE_APP_ID" "$OUT/export-verification.json" "${TESTFLIGHT_NOTES:-Platform TestFlight build}" "$OUT/upload-result.json"
  STATUS=uploaded-processing-unverified
fi
