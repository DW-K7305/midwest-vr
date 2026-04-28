# MidWest-VR Launcher (Android APK)

A custom Android home-screen replacement for Meta Quest 2 headsets. Sideload
this APK onto each headset; pin it as the launcher (or run it via the Quest's
"Unknown Sources" library). Once running, it shows a school-branded grid of
**only the apps you approve**, with big tiles, optional class-period rules,
and a clean reading-friendly UI.

## What it does

- Lists installed apps on the headset, optionally filtered by an allowlist
  defined in `launcher_config.json` (pushed by the MidWest-VR Mac app).
- Renders them as big, tappable tiles with optional thumbnail mapping.
- Handles a **CATEGORY_HOME** intent filter so it can be set as the system
  launcher on Quest 2 (with the user's confirmation on the headset).
- Reads/writes a small JSON config at `/sdcard/Android/data/com.midwestvr.launcher/files/launcher_config.json`.
- Has a hidden teacher-mode (long-press top-left → enter PIN) that opens the
  Quest's normal home so staff can troubleshoot.

## Building

This sub-project is a standalone Gradle/Kotlin Android app. It builds
independently from the Mac fleet manager. The GitHub Actions workflow at
`.github/workflows/build-launcher.yml` produces `launcher-release.apk` as a
downloadable artifact alongside the macOS build.

To build locally on a Mac/Linux machine with the Android SDK:

```bash
cd launcher
./gradlew assembleRelease
# APK lands at: app/build/outputs/apk/release/app-release-unsigned.apk
```

## Wiring with MidWest-VR

The Mac fleet manager has a "Push launcher" command that:

1. Includes the latest `launcher-release.apk` as a bundled resource.
2. `adb install -r` the APK onto the selected headset(s).
3. Writes the active `launcher_config.json` to the headset's app-data folder.
4. (Optional) Calls `adb shell cmd package set-home-activity com.midwestvr.launcher/.MainActivity`
   on the headset to set it as default home — this requires the headset user
   to confirm the change once.

## Limitations (be honest about these)

- **Quest 2 system home cannot be fully replaced** without Quest for Business
  enrollment or device-owner provisioning. The Oculus button still opens
  Meta's universal menu. This is a per-app launcher / classroom shell, not a
  total takeover.
- **Newer Quest OS revisions may break launcher-replacement APIs.** If a
  Quest update breaks the home-activity setting, fallback is "use Kiosk mode
  instead" (already implemented in MidWest-VR for Quest 2).
- **Kotlin / minSdk 29** target. Quest 2 runs Android 10 → API 29.

## License

Same as the parent project (MidWest-VR).
