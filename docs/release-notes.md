First public release of **120mm**, a local blood pressure journal for Android.

- Bluetooth history sync with incremental downloads and automatic reconnection.
- Live measurement display and automatic history refresh after completion.
- Separate profiles for family members, charts, and day/week/month navigation.
- Russian and English UI selected from the system language; light and dark themes.
- JSON backup/import and CSV export. No account or cloud service required.

**Supported device:** Omron X1-G with firmware SI.W03.01.00. Other models are not supported yet. Live monitoring requires the app to remain open. This is an independent project, not an official manufacturer app.

**Install:** download `120mm-0.2.2.apk`. Android 7.0 or later and Bluetooth LE are required. The `.sha256` attachment contains its checksum.

**Moving from a development APK:** export your JSON backup first. This release uses a permanent release key, so Android will not install it over a debug-signed build. After backing up, uninstall the development build, install this APK, and import your archive. Future releases will use the same signing key.

The protocol was previously checked with a physical X1-G. This release is built, tested, linted and signed by GitHub Actions; the resulting GitHub APK has not yet been tested on a physical Android phone.
