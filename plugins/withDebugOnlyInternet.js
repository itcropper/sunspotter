// The app makes no network calls. Release builds block INTERNET (app.json blockedPermissions).
// Debug builds need it only to reach the Metro dev server, so it is re-added in a debug-only
// manifest that the release variant never merges.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withDebugOnlyInternet(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'debug');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'AndroidManifest.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
    <!-- Debug only: lets the dev client reach Metro. Never merged into release. -->
    <uses-permission android:name="android.permission.INTERNET" tools:node="replace" />
    <application android:usesCleartextTraffic="true" tools:targetApi="28" tools:ignore="GoogleAppIndexingWarning" tools:replace="android:usesCleartextTraffic" />
</manifest>
`,
      );
      return cfg;
    },
  ]);
};
