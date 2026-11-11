# Project rules

- Do not change versionName, versionCode or package versions unless explicitly requested.
- Local builds are working samples (`mobile/releases/120mm-dev.apk`).
- Release APKs are built only for a manually prepared `vX.Y.Z` tag.
- Keep proprietary APKs, decompiled code, device dumps, personal measurements,
  screenshots with real measurements, signing keys and local toolchains out of Git.
- Test fixtures must be synthetic. Preserve third-party license notices.
- Keep the X1-G / SI.W03.01.00 protocol guard. Do not generalize memory writes.
- Keep UI strings in the shared i18n catalog; support Russian and English, including accessibility labels. Never translate stored user names or change archive field names.
