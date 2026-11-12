#!/usr/bin/env bash
# Builds a signed Android App Bundle (.aab) for Google Play. Needs the Android SDK, a JDK and bundletool.
#   BUNDLETOOL_JAR   path to bundletool-all-*.jar
#   UPLOAD_KEYSTORE  PKCS12 upload keystore (the key Play checks uploads against; keep it backed up)
#   UPLOAD_STORE_PASS, UPLOAD_KEY_ALIAS   its password and alias
# Usage: android/build-aab.sh [output-dir]
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
OUT_DIR="${1:-$ROOT_DIR/dist}"
mkdir -p "$OUT_DIR"
: "${BUNDLETOOL_JAR:?set BUNDLETOOL_JAR}" "${UPLOAD_KEYSTORE:?set UPLOAD_KEYSTORE}" "${UPLOAD_STORE_PASS:?set UPLOAD_STORE_PASS}" "${UPLOAD_KEY_ALIAS:?set UPLOAD_KEY_ALIAS}"

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"
# newest build-tools that actually ship aapt2 and d8 (some installs are incomplete); .exe/.bat on Windows
LATEST_BT=""
for d in $(ls -1d "$SDK_ROOT"/build-tools/* | sort -rV); do
  if ls "$d"/aapt2* >/dev/null 2>&1 && ls "$d"/d8* >/dev/null 2>&1; then LATEST_BT="$d"; break; fi
done
[ -n "$LATEST_BT" ] || { echo "ERROR: no build-tools with aapt2 and d8 in $SDK_ROOT" >&2; exit 1; }
LATEST_PLAT="$(ls -1d "$SDK_ROOT"/platforms/android-[0-9]* | sort -V | tail -n 1)"
AAPT2="$(ls "$LATEST_BT"/aapt2* | head -n 1)"; D8="$(ls "$LATEST_BT"/d8* | head -n 1)"; ANDROID_JAR="$LATEST_PLAT/android.jar"
echo "Using $ANDROID_JAR and $LATEST_BT"

WORK="$ANDROID_DIR/.build-aab"
rm -rf "$WORK"
mkdir -p "$WORK/res/values" "$WORK/res/drawable" "$WORK/res/mipmap-hdpi" "$WORK/res/mipmap-xxxhdpi" "$WORK/compiled_res" "$WORK/gen" "$WORK/classes" "$WORK/dex" "$WORK/module/manifest" "$WORK/module/dex"
cp "$ANDROID_DIR/res/values/strings.xml" "$WORK/res/values/"
cp "$ANDROID_DIR/res/drawable/ic_stat_notify.xml" "$WORK/res/drawable/"
cp "$ROOT_DIR/public/icons/icon-192.png" "$WORK/res/mipmap-hdpi/ic_launcher.png"
cp "$ROOT_DIR/public/icons/icon-512.png" "$WORK/res/mipmap-xxxhdpi/ic_launcher.png"

# resources and manifest in the protobuf format bundles use
"$AAPT2" compile --dir "$WORK/res" -o "$WORK/compiled_res/resources.zip"
"$AAPT2" link --proto-format -I "$ANDROID_JAR" --manifest "$ANDROID_DIR/AndroidManifest.xml" --java "$WORK/gen" \
  --min-sdk-version 24 --target-sdk-version 36 --auto-add-overlay -o "$WORK/proto.zip" "$WORK/compiled_res/resources.zip"

mapfile -t JAVA_SRCS < <(find "$ANDROID_DIR/java" "$WORK/gen" -name "*.java" | sort)
javac --release 11 -encoding UTF-8 -Xlint:-deprecation -cp "$ANDROID_JAR" -d "$WORK/classes" "${JAVA_SRCS[@]}"
mapfile -t CLASS_FILES < <(find "$WORK/classes" -name "*.class" | sort)
"$D8" --min-api 24 --lib "$ANDROID_JAR" --release --output "$WORK/dex" "${CLASS_FILES[@]}"

# base module layout: manifest/AndroidManifest.xml, dex/, res/, resources.pb
(cd "$WORK/module" && unzip -q "$WORK/proto.zip")
mv "$WORK/module/AndroidManifest.xml" "$WORK/module/manifest/AndroidManifest.xml"
cp "$WORK/dex/classes.dex" "$WORK/module/dex/classes.dex"
(cd "$WORK/module" && jar cfM "$WORK/base.zip" .)

AAB="$OUT_DIR/NewNewz.aab"
rm -f "$AAB"
java -jar "$BUNDLETOOL_JAR" build-bundle --modules="$WORK/base.zip" --output="$AAB"
jarsigner -keystore "$UPLOAD_KEYSTORE" -storetype PKCS12 -storepass "$UPLOAD_STORE_PASS" -sigalg SHA256withRSA -digestalg SHA-256 "$AAB" "$UPLOAD_KEY_ALIAS" >/dev/null
jarsigner -verify "$AAB" | head -1
java -jar "$BUNDLETOOL_JAR" validate --bundle="$AAB"
rm -rf "$WORK"
ls -lh "$AAB"
