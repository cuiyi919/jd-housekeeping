#!/usr/bin/env bash
# Run on macOS after Expo prebuild and pod install. No Apple credentials needed.
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'This build step requires macOS and Xcode. Use the GitHub Actions workflow.' >&2
  exit 1
fi

shopt -s nullglob
workspaces=(ios/*.xcworkspace)
schemes=(ios/*.xcodeproj/xcshareddata/xcschemes/*.xcscheme)
if [[ ${#workspaces[@]} -ne 1 || ${#schemes[@]} -ne 1 ]]; then
  echo 'Expected one generated app workspace and one shared app scheme.' >&2
  exit 1
fi
scheme="$(basename "${schemes[0]}" .xcscheme)"
build_root="$PWD/build"
mkdir -p "$build_root/ipa"
# Use a fresh archive path for every local run without deleting existing output.
run_root="$(mktemp -d "$build_root/ios.XXXXXX")"
xcodebuild -version

xcodebuild \
  -workspace "${workspaces[0]}" \
  -scheme "$scheme" \
  -configuration Release \
  -sdk iphoneos \
  -destination 'generic/platform=iOS' \
  -archivePath "$run_root/Housekeeping.xcarchive" \
  -derivedDataPath "$run_root/DerivedData" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY= \
  DEVELOPMENT_TEAM= \
  archive 2>&1 | tee "$build_root/xcodebuild.log"

apps=("$run_root/Housekeeping.xcarchive/Products/Applications/"*.app)
if [[ ${#apps[@]} -ne 1 ]]; then
  echo 'Archive did not contain exactly one device app.' >&2
  exit 1
fi
app="${apps[0]}"
if [[ ! -s "$app/main.jsbundle" ]]; then
  echo 'Missing embedded JavaScript bundle; refusing to package a Metro-dependent app.' >&2
  exit 1
fi
executable="$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Info.plist")"
lipo -verify_arch arm64 "$app/$executable"

mkdir -p "$run_root/package/Payload"
ditto "$app" "$run_root/package/Payload/$(basename "$app")"
ipa="$run_root/housekeeping-unsigned.ipa"
(cd "$run_root/package" && /usr/bin/zip -qry "$ipa" Payload)
cp "$ipa" "$build_root/ipa/housekeeping-unsigned.ipa"
(cd "$build_root/ipa" && shasum -a 256 housekeeping-unsigned.ipa > housekeeping-unsigned.ipa.sha256)

APP_PLIST="$app/Info.plist" python3 <<'PY'
import json, os, plistlib, subprocess
from pathlib import Path
with open(os.environ['APP_PLIST'], 'rb') as f:
    info = plistlib.load(f)
metadata = {
    'bundleIdentifier': info['CFBundleIdentifier'],
    'version': info['CFBundleShortVersionString'],
    'buildNumber': info['CFBundleVersion'],
    'minimumIOS': info.get('MinimumOSVersion'),
    'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'configuration': 'Release',
    'signing': 'Unsigned; sign on your computer with Sideloadly before installation',
}
Path('build/ipa/build-info.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps(metadata, indent=2))
PY

if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then
  cat >> "$GITHUB_STEP_SUMMARY" <<'SUMMARY'
## iPhone IPA is ready

Download the **housekeeping-iphone** artifact from this run and unzip it.
Use **Sideloadly** on Windows to sign and install `housekeeping-unsigned.ipa`.
This is a device Release build with embedded app code, not an iOS simulator build.
No Apple ID, signing certificate, or Expo token was used by this workflow.

For an update, keep the same Apple ID and bundle identifier and install over the old app.
Export records from Expo Go first, then import them into the installed app.
SUMMARY
fi
