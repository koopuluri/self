#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/.."
PROBE_ROOT=$(mktemp -d /private/tmp/ghost-profile-probe.XXXXXX)
PROBE_ID="local.ghost.browser.persistence-probe.$(uuidgen | tr '[:upper:]' '[:lower:]')"
PROBE_MARKER=$(uuidgen)
export CLANG_MODULE_CACHE_PATH="$PROBE_ROOT/module-cache"

for version in 1 2; do
    PROBE_APP="$PROBE_ROOT/location-$version/Ghost Profile Probe.app"
    mkdir -p "$PROBE_APP/Contents/MacOS"
    swiftc -parse-as-library Sources/GhostBrowser/BrowserProfile.swift Tests/ProfileProbe.swift -o "$PROBE_APP/Contents/MacOS/ProfileProbe" -D "PROBE_BUILD_$version"
    cat > "$PROBE_APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>$PROBE_ID</string>
<key>CFBundleExecutable</key><string>ProfileProbe</string>
<key>CFBundleName</key><string>Ghost Profile Probe</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>$version</string>
<key>LSUIElement</key><true/>
</dict></plist>
PLIST
    codesign --force --sign - "$PROBE_APP"
    if [[ "$version" == 1 ]]; then
        "$PROBE_APP/Contents/MacOS/ProfileProbe" write "$PROBE_MARKER"
    else
        "$PROBE_APP/Contents/MacOS/ProfileProbe" read "$PROBE_MARKER"
    fi
done
print "Profile continuity verified across process exit, rebuild, app version and location changes."
