#!/usr/bin/env bash
# Select a simulator scene on the Android emulator (debug build), then relaunch the app.
set -euo pipefail
SCENE="${1:-main}"
ADB="${ADB:-$(command -v adb || echo "$HOME/Library/Android/sdk/platform-tools/adb")}"
PKG=com.sunspotter.app
"$ADB" shell am force-stop $PKG
"$ADB" shell "run-as $PKG sh -c 'mkdir -p shared_prefs && echo \"<?xml version=\\\"1.0\\\" encoding=\\\"utf-8\\\"?><map><string name=\\\"sim\\\">$SCENE</string><string name=\\\"hintShown\\\">true</string></map>\" > shared_prefs/sunspotter.xml'"
"$ADB" shell am start -n $PKG/.MainActivity >/dev/null
