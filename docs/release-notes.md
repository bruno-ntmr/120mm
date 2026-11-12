120mm 0.2.3 — Android release prepared for Google Play.

- Permanent application ID: `biz.babka.mm120`.
- Signed APK for direct installation and signed AAB for Google Play, built from the same source.
- Bilingual privacy policy available in the app, including before adding a device.
- Fixed the 120mm name on narrow screens.

**Download:** `120mm-0.2.3.apk` for installation on Android 7.0 or later. The `.aab` file is intended for Play Console, not direct installation. SHA-256 checksums are provided for both files.

**Moving from 0.2.2 or a development build:** export your journal as JSON first. The application ID has changed, so this release installs as a separate app and does not automatically inherit the old journal. Import the JSON archive into the new app and verify your data before removing the old one.

**Supported device:** Omron X1-G with firmware SI.W03.01.00. Other models and firmware versions are not supported. Bluetooth LE is required; live measurement monitoring requires the app to remain open. This is an independent project, not an official manufacturer app.

No account or developer-operated cloud synchronization is required. Privacy policy: https://bruno-ntmr.github.io/120mm/

GitHub Actions runs tests, Android lint, release builds and signature verification. This exact release has not yet been tested on a physical Android phone.
