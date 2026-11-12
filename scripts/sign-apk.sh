#!/usr/bin/env bash
set -euo pipefail
: "${RELEASE_TAG:?}"
[[ "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo 'Invalid release tag' >&2; exit 1; }
: "${ANDROID_KEYSTORE_BASE64:?Configure Android signing secrets}"
: "${ANDROID_KEYSTORE_PASSWORD:?}"
: "${ANDROID_KEY_ALIAS:?}"
: "${ANDROID_KEY_PASSWORD:?}"
: "${ANDROID_HOME:?}"
signing_dir=$(mktemp -d)
trap 'rm -rf "$signing_dir"' EXIT
export SIGNING_KEY_FILE="$signing_dir/release.jks"
python3 - <<'PY'
import base64, os
with open(os.environ['SIGNING_KEY_FILE'], 'wb') as f:
    f.write(base64.b64decode(os.environ['ANDROID_KEYSTORE_BASE64'], validate=True))
os.chmod(os.environ['SIGNING_KEY_FILE'], 0o600)
PY
build_tools="$ANDROID_HOME/build-tools/36.0.0"
mkdir -p mobile/releases
apk="mobile/releases/120mm-${RELEASE_TAG#v}.apk"
"$build_tools/zipalign" -f -p 4 mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk "$signing_dir/aligned.apk"
"$build_tools/apksigner" sign --ks "$SIGNING_KEY_FILE" --ks-key-alias "$ANDROID_KEY_ALIAS" --ks-pass env:ANDROID_KEYSTORE_PASSWORD --key-pass env:ANDROID_KEY_PASSWORD --out "$apk" "$signing_dir/aligned.apk"
"$build_tools/apksigner" verify --verbose "$apk"
"$build_tools/zipalign" -c -p 4 "$apk"
(cd mobile/releases && sha256sum "$(basename "$apk")" > "$(basename "$apk").sha256")

# App Bundles use JAR signing, not apksigner.
aab="mobile/releases/120mm-${RELEASE_TAG#v}.aab"
cp mobile/android/app/build/outputs/bundle/release/app-release.aab "$aab"
jarsigner -keystore "$SIGNING_KEY_FILE" -storepass:env ANDROID_KEYSTORE_PASSWORD -keypass:env ANDROID_KEY_PASSWORD -sigalg SHA256withRSA -digestalg SHA-256 "$aab" "$ANDROID_KEY_ALIAS"
jarsigner -verify -strict -keystore "$SIGNING_KEY_FILE" -storepass:env ANDROID_KEYSTORE_PASSWORD "$aab"
(cd mobile/releases && sha256sum "$(basename "$aab")" > "$(basename "$aab").sha256")
