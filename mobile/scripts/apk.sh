#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
: "${JAVA_HOME:?Set JAVA_HOME to a Java 21 JDK}"
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
: "${ANDROID_HOME:?Set ANDROID_HOME to your Android SDK}"
# No machine-specific toolchain paths are tracked.
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > android/local.properties
cd android
./gradlew --no-daemon :app:assembleDebug "$@"
mkdir -p ../releases
cp app/build/outputs/apk/debug/app-debug.apk ../releases/120mm-dev.apk
