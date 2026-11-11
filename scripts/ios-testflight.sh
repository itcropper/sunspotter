#!/usr/bin/env bash
# Archive a signed Release build and upload it to App Store Connect (TestFlight).
# Needs: the Apple ID signed in under Xcode › Settings › Accounts, and an App Store Connect
# app record whose bundle ID matches app.json (ios.bundleIdentifier).
# Usage: scripts/ios-testflight.sh [build-number]   (default: current UTC timestamp)
set -euo pipefail
cd "$(dirname "$0")/.."
TEAM="${TEAM:-845SD4VFJN}"
BUILD="${1:-$(date -u +%Y%m%d%H%M)}"
OUT="${OUT:-build/ios-testflight}"
mkdir -p "$OUT"

npm run check
[ -d ios ] || CI=1 npx expo prebuild -p ios --clean

xcodebuild -workspace ios/SunSpotter.xcworkspace -scheme SunSpotter -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$OUT/SunSpotter.xcarchive" \
  -allowProvisioningUpdates DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic \
  CURRENT_PROJECT_VERSION="$BUILD" archive

cat > "$OUT/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$TEAM</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
PLIST

xcodebuild -exportArchive -archivePath "$OUT/SunSpotter.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$OUT/export" -allowProvisioningUpdates
echo "Uploaded build $BUILD. It appears in App Store Connect › TestFlight after processing."
