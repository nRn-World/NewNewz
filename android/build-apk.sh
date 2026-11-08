#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
OUT_DIR="${1:-$ROOT_DIR/dist}"
mkdir -p "$OUT_DIR"

SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"
if [ ! -d "$SDK_ROOT" ]; then
  echo "ERROR: Android SDK not found at $SDK_ROOT" >&2
  exit 1
fi

# Ensure at least one platform and build-tools exist (auto-install via sdkmanager if needed)
LATEST_BT="$(ls -1d "$SDK_ROOT"/build-tools/* 2>/dev/null | sort -V | tail -n 1 || true)"
LATEST_PLAT="$(ls -1d "$SDK_ROOT"/platforms/android-* 2>/dev/null | sort -V | tail -n 1 || true)"
if [ -z "$LATEST_BT" ] || [ -z "$LATEST_PLAT" ]; then
  SDKM="$(find "$SDK_ROOT" -name sdkmanager | head -n 1 || true)"
  if [ -n "$SDKM" ]; then
    yes | "$SDKM" --licenses >/dev/null 2>&1 || true
    "$SDKM" "platforms;android-34" "build-tools;34.0.0"
    LATEST_BT="$(ls -1d "$SDK_ROOT"/build-tools/* | sort -V | tail -n 1)"
    LATEST_PLAT="$(ls -1d "$SDK_ROOT"/platforms/android-* | sort -V | tail -n 1)"
  fi
fi

AAPT2="$LATEST_BT/aapt2"
D8="$LATEST_BT/d8"
ZIPALIGN="$LATEST_BT/zipalign"
APKSIGNER="$LATEST_BT/apksigner"
ANDROID_JAR="$LATEST_PLAT/android.jar"

echo "Using Android platform: $ANDROID_JAR"
echo "Using Android build-tools: $LATEST_BT"

WORK="$ANDROID_DIR/.build"
rm -rf "$WORK"
mkdir -p "$WORK/res/values" "$WORK/res/drawable" "$WORK/res/mipmap-hdpi" "$WORK/res/mipmap-xxxhdpi" "$WORK/compiled_res" "$WORK/gen" "$WORK/classes" "$WORK/dex"

cp "$ANDROID_DIR/res/values/strings.xml" "$WORK/res/values/strings.xml"
cp "$ANDROID_DIR/res/drawable/ic_stat_notify.xml" "$WORK/res/drawable/ic_stat_notify.xml"
cp "$ROOT_DIR/public/icons/icon-192.png" "$WORK/res/mipmap-hdpi/ic_launcher.png"
cp "$ROOT_DIR/public/icons/icon-512.png" "$WORK/res/mipmap-xxxhdpi/ic_launcher.png"

# 1. Compile & link Android resources -> R.java + resource APK
"$AAPT2" compile --dir "$WORK/res" -o "$WORK/compiled_res/resources.zip"
"$AAPT2" link \
  -I "$ANDROID_JAR" \
  --manifest "$ANDROID_DIR/AndroidManifest.xml" \
  --java "$WORK/gen" \
  --min-sdk-version 24 \
  --target-sdk-version 34 \
  --auto-add-overlay \
  -o "$WORK/unaligned.apk" \
  "$WORK/compiled_res/resources.zip"

# 2. Compile Java sources + generated R.java
mapfile -t JAVA_SRCS < <(find "$ANDROID_DIR/java" "$WORK/gen" -name "*.java" | sort)
javac --release 11 -encoding UTF-8 -Xlint:-deprecation \
  -cp "$ANDROID_JAR" \
  -d "$WORK/classes" \
  "${JAVA_SRCS[@]}"

# 3. Compile all .class files (including inner classes) -> classes.dex
mapfile -t CLASS_FILES < <(find "$WORK/classes" -name "*.class" | sort)
"$D8" --min-api 24 --lib "$ANDROID_JAR" --output "$WORK/dex" "${CLASS_FILES[@]}"

# 4. Package classes.dex into APK & zipalign
(cd "$WORK/dex" && zip -q "$WORK/unaligned.apk" classes.dex)
"$ZIPALIGN" -p -f 4 "$WORK/unaligned.apk" "$WORK/aligned.apk"

# 5. Prepare PKCS#12 signing keystore (from ANDROID_KEYSTORE_B64 if provided, else generate standard RSA-2048 keystore)
KEYSTORE="$WORK/release.p12"
KS_PASS="${ANDROID_KEYSTORE_PASS:-newzlocal}"
KS_ALIAS="${ANDROID_KEY_ALIAS:-newzlocal}"

if [ -n "${ANDROID_KEYSTORE_B64:-}" ]; then
  printf '%s' "$ANDROID_KEYSTORE_B64" | tr -d ' \n\r\t' | base64 -d > "$KEYSTORE"
else
  keytool -genkeypair \
    -keystore "$KEYSTORE" \
    -storetype PKCS12 \
    -storepass "$KS_PASS" \
    -keypass "$KS_PASS" \
    -alias "$KS_ALIAS" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10950 \
    -dname "CN=NewzLocal, O=nRn World, C=SE" >/dev/null 2>&1
fi

# 6. Sign with v1 + v2 + v3 schemes & verify
"$APKSIGNER" sign \
  --ks "$KEYSTORE" \
  --ks-type PKCS12 \
  --ks-key-alias "$KS_ALIAS" \
  --ks-pass "pass:$KS_PASS" \
  --key-pass "pass:$KS_PASS" \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$OUT_DIR/NewzLocal.apk" \
  "$WORK/aligned.apk"

"$APKSIGNER" verify --verbose "$OUT_DIR/NewzLocal.apk"

# 7. Emit Digital Asset Links (.well-known/assetlinks.json) matching the exact APK certificate SHA-256
SHA256_FP="$(keytool -list -v -keystore "$KEYSTORE" -storetype PKCS12 -storepass "$KS_PASS" -alias "$KS_ALIAS" | awk '/SHA256:/{print $2; exit}')"
if [ -n "$SHA256_FP" ]; then
  mkdir -p "$OUT_DIR/.well-known"
  cat > "$OUT_DIR/.well-known/assetlinks.json" <<EOF
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "one.nrnworld.newzlocal",
      "sha256_cert_fingerprints": ["$SHA256_FP"]
    }
  }
]
EOF
  echo "Generated assetlinks.json with SHA-256: $SHA256_FP"
fi

rm -rf "$WORK"
ls -lh "$OUT_DIR/NewzLocal.apk"
