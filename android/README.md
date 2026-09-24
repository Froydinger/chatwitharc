# ArcAI for Android

This is a Bubblewrap Trusted Web Activity for ArcAI's existing PWA at `https://askarc.chat`. It uses the live site and its service worker, including the existing web-push flow. The native package is `chat.askarc.android` for now; confirm it before creating the Play listing because the listing's package ID is permanent.

The app targets Android API 36 and uses immersive display mode to hide browser and system bars while the TWA is active. Android can reveal its system bars with a swipe. `twa-manifest.json` is the Bubblewrap project configuration.

The upload key is stored outside the repository at `~/.bubblewrap/arcai-upload.keystore`; its password is in the macOS login Keychain under account `chat.askarc.android` and service `ArcAI Android Upload Keystore Password`. Never commit the key or password. Run `./build-release.sh` to build a signed APK and App Bundle. `public/.well-known/assetlinks.json` associates the site with this upload certificate for local installation. Add the Play app-signing certificate fingerprint there after enabling Play App Signing, since Play re-signs delivered APKs with its own certificate.

The local Android SDK and JDK paths are in Bubblewrap's user-level config, outside this repository. A debug build can be produced with `./gradlew assembleDebug` from this directory; that is build evidence only. Notification delivery, notification taps, sign-in, and voice still need a real Android device check.

Run `./build-site-apk.sh` to build the signed direct-install APK and copy it to `public/downloads/ArcAI-Android-Beta.apk`. The direct APK launches with `source=android-direct` and uses the web Boost checkout. The Play App Bundle built with `./build-release.sh bundleRelease` launches with `source=android-play` and uses Google Play Billing. Increment `versionCode` for future native updates, then rebuild and replace the site APK. Google Play may sign installs with a different certificate, so direct-install users may need to uninstall before moving to the Play build.
