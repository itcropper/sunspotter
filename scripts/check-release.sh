#!/usr/bin/env bash
# Verifies the Android release build: no INTERNET permission in the merged manifest, and no
# simulator code in the JS bundle.
set -euo pipefail
cd "$(dirname "$0")/../android"
MANIFEST=app/build/intermediates/merged_manifests/release/processReleaseManifest/AndroidManifest.xml
[ -f "$MANIFEST" ] || MANIFEST=$(find app/build/intermediates -path '*release*' -name AndroidManifest.xml | grep -i merged | head -1)
echo "Manifest: $MANIFEST"
grep -o 'uses-permission[^>]*' "$MANIFEST" || true
if grep -q 'android.permission.INTERNET' "$MANIFEST"; then echo "FAIL: INTERNET in release manifest"; exit 1; fi
echo "OK: no INTERNET permission"
BUNDLE=$(find app/build -name 'index.android.bundle' -path '*release*' | head -1)
echo "Bundle: $BUNDLE"
if grep -aq 'SUNSPOTTER_SIMULATOR_MODE' "$BUNDLE"; then echo "FAIL: simulator in release bundle"; exit 1; fi
echo "OK: simulator absent from release bundle"
