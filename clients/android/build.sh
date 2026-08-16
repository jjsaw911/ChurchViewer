#!/usr/bin/env bash
#
# Build the Android remote, without Gradle.
#
#   ./build.sh              a signed, installable APK at ChurchViewer-Remote.apk
#   ./build.sh --install    and push it onto whatever is plugged in
#
# No Gradle and no Android plugin on purpose. This app has no dependencies at
# all — one activity, a web view and six buttons — and the toolchain versions
# that a Gradle build insists on agreeing about are the only hard part of
# building it. aapt2, d8 and apksigner ship with the SDK and do the whole job.
set -euo pipefail

cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
PLATFORM_VERSION="${PLATFORM_VERSION:-android-34}"
BUILD_TOOLS_VERSION="${BUILD_TOOLS_VERSION:-$(ls "$SDK/build-tools" | sort -V | tail -1)}"

TOOLS="$SDK/build-tools/$BUILD_TOOLS_VERSION"
PLATFORM="$SDK/platforms/$PLATFORM_VERSION/android.jar"
OUT=".build"
APK="ChurchViewer-Remote.apk"

[ -f "$PLATFORM" ] || { echo "No $PLATFORM_VERSION in $SDK/platforms." >&2; exit 1; }
[ -x "$TOOLS/aapt2" ] || { echo "No build-tools in $SDK." >&2; exit 1; }

echo "==> Resources"
rm -rf "$OUT" "$APK"
mkdir -p "$OUT/compiled" "$OUT/classes"
"$TOOLS/aapt2" compile --dir res -o "$OUT/compiled/res.zip"
"$TOOLS/aapt2" link \
  -o "$OUT/base.apk" \
  -I "$PLATFORM" \
  --manifest AndroidManifest.xml \
  --java "$OUT" \
  "$OUT/compiled/res.zip"

echo "==> Compiling"
# `--release` rather than -source/-target: modern javac refuses a bootclasspath
# alongside those, and the platform jar on the classpath is what the app is
# actually compiled against.
javac --release 17 -nowarn \
  -classpath "$PLATFORM" \
  -d "$OUT/classes" \
  $(find src "$OUT" -name '*.java')

echo "==> Dexing"
"$TOOLS/d8" --lib "$PLATFORM" --output "$OUT" $(find "$OUT/classes" -name '*.class')

echo "==> Packaging"
(cd "$OUT" && zip -q base.apk classes.dex)

# A debug key, made once and kept. Not a release signature — this is a file a
# church side-loads, and Android only insists that it is signed by something.
KEYSTORE="$OUT/../debug.keystore"
if [ ! -f "$KEYSTORE" ]; then
  echo "==> Making a signing key"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass churchviewer -keypass churchviewer \
    -alias churchviewer -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=ChurchViewer, O=ChurchViewer, C=US" >/dev/null 2>&1
fi

"$TOOLS/zipalign" -f 4 "$OUT/base.apk" "$OUT/aligned.apk"
"$TOOLS/apksigner" sign \
  --ks "$KEYSTORE" --ks-pass pass:churchviewer --key-pass pass:churchviewer \
  --out "$APK" "$OUT/aligned.apk"

rm -rf "$OUT"
echo "==> Built: $(pwd)/$APK"

if [ "${1:-}" = "--install" ]; then
  echo "==> Installing"
  adb install -r "$APK"
fi
