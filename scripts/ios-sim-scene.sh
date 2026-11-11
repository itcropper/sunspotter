#!/usr/bin/env bash
# Select a simulator scene in the booted iOS Simulator (debug build, Metro running on 8081),
# relaunch the app, and optionally save a screenshot: scripts/ios-sim-scene.sh <scene> [out.png]
set -euo pipefail
SCENE="${1:-main}"
OUT="${2:-}"
DEV="${SIM_DEVICE:-booted}"
APP=com.sunspotter.app
URL="exp+sunspotter://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"

# Pre-approve the dev-client URL scheme so iOS doesn't ask "Open in SunSpotter?".
if [ "$DEV" = booted ]; then UDID=$(xcrun simctl list devices booted | grep -oE '[0-9A-F-]{36}' | head -1); else UDID="$DEV"; fi
PLIST="$HOME/Library/Developer/CoreSimulator/Devices/$UDID/data/Library/Preferences/com.apple.launchservices.schemeapproval.plist"
[ -f "$PLIST" ] || plutil -create xml1 "$PLIST"
plutil -replace 'com\.apple\.CoreSimulator\.CoreSimulatorBridge-->exp+sunspotter' -string "$APP" "$PLIST"

xcrun simctl terminate "$DEV" "$APP" 2>/dev/null || true
for k in EXDevMenuIsOnboardingFinished:YES EXDevMenuShowFloatingActionButton:NO EXDevMenuShowsAtLaunch:NO; do
  xcrun simctl spawn "$DEV" defaults write "$APP" "${k%%:*}" -bool "${k##*:}"
done
xcrun simctl spawn "$DEV" defaults write "$APP" sunspotter.sim "$SCENE"
xcrun simctl spawn "$DEV" defaults write "$APP" sunspotter.hintShown true
xcrun simctl status_bar "$DEV" override --time 17:42 --batteryState charged --batteryLevel 100
xcrun simctl openurl "$DEV" "$URL"
if [ -n "$OUT" ]; then sleep "${WAIT:-15}"; xcrun simctl io "$DEV" screenshot "$OUT"; fi
