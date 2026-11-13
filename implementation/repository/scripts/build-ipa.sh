#!/usr/bin/env bash
# Usage: bash scripts/build-ipa.sh <version> <build> <profile-name> <new-output-dir>
# The iPhone and iPad build for TestFlight: the Xcode project generated for the design, archived and exported for App Store
# Connect with the team (TEAM_ID) and the App Store profile from the store's signing answer, which the release workflow
# puts in a temporary keychain. Writes <application id>.ipa into the output folder.
set -euo pipefail
[[ $# == 4 && ! -e "$4" && -d "$(dirname "$4")" ]] || { echo 'Expected version, build, profile name and a new output directory' >&2; exit 2; }
VERSION="$1"; BUILD="$2"; PROFILE="$3"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "$BUILD" =~ ^[1-9][0-9]*$ && -n "$PROFILE" ]] || { echo 'Invalid version, build or profile' >&2; exit 2; }
: "${TEAM_ID:?the team from the store signing answer}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPLICATION=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["id"])' "$ROOT/release/app.json")
mkdir "$4"
OUT="$(cd "$4" && pwd)"
cd "$ROOT/ios"
node generate-project.ts
xcodegen generate
PROJECT=$(find . -maxdepth 1 -name '*.xcodeproj' | head -1)
SCHEME=$(basename "$PROJECT" .xcodeproj)
# The application target signs manually with the team and profile in <PREFIX>_TEAM and <PREFIX>_PROFILE.
PREFIX=$(sed -nE 's/.*DEVELOPMENT_TEAM: "\$\(([A-Z0-9_]+)_TEAM\)".*/\1/p' project.yml | head -1)
[[ -n "$PREFIX" ]] || { echo 'project.yml names no signing team variable' >&2; exit 1; }
xcodebuild -project "$PROJECT" -scheme "$SCHEME" -configuration Release -destination 'generic/platform=iOS' -derivedDataPath build/DerivedData \
  -archivePath "$OUT/$SCHEME.xcarchive" -quiet archive \
  MARKETING_VERSION="$VERSION" CURRENT_PROJECT_VERSION="$BUILD" "${PREFIX}_TEAM=$TEAM_ID" "${PREFIX}_PROFILE=$PROFILE"
python3 -c 'import html, sys; sys.stdout.write(sys.stdin.read().replace("PROFILE_NAME", html.escape(sys.argv[1])).replace("TEAM_ID", html.escape(sys.argv[2])))' \
  "$PROFILE" "$TEAM_ID" < ExportOptions-ios.plist > "$OUT/ExportOptions.plist"
xcodebuild -exportArchive -archivePath "$OUT/$SCHEME.xcarchive" -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" -quiet
mv "$OUT"/export/*.ipa "$OUT/$APPLICATION.ipa"
echo "wrote $OUT/$APPLICATION.ipa"
