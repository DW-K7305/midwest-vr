MidWest-VR — Phases 43 + 44 + 45 (8 files).

THE BIG MOVES THIS ROUND:

1. Launcher APK is now bundled INSIDE the Mac app.
   No more "find the APK file" dialog. The Class Mode "Push Launcher
   to N" button now silently uses the APK that was baked in at build
   time. The GitHub Actions Mac workflow now builds the launcher APK
   first, copies it into Tauri resources, and Tauri bundles it into
   MidWest-VR.app/Contents/Resources/. Class Mode's orange banner
   actually works on click now.

   Caveat: this is the first build that adds a 5-minute Android-build
   step at the front of the Mac workflow, so this build will take
   longer than usual. Subsequent builds will cache and be back to
   normal speed.

2. Click any device card on the Dashboard → command center opens.
   Everything for that one headset in one panel: stat strip (battery,
   storage, connection, class lock), inline rename, quick actions
   (screenshot, sync time, restart, power off), apply a saved profile,
   push Wi-Fi credentials, full installed-apps list with Launch / Lock
   / Force-stop / Remove per app, kiosk status with End-class button,
   factory reset tucked in a "Danger zone" details accordion. Nothing
   per-headset is more than one click from the Dashboard now. The
   Class Mode and Profiles pages remain for FLEET-wide bulk operations.

3. Discover sideload-but-no-APK now shows a real button.
   Before: clicking Open Brush surfaced the cryptic "no apk_url in
   catalog entry" error. Now: when an entry is flagged sideload but
   has no direct APK URL, the detail dialog shows a "Get APK from
   publisher" button that opens GitHub Releases (or wherever the
   source_url points). User can download and use Apps → Install APK
   from file. Honest UX, no broken Install button.

UPLOAD: drag the inner .github/, src/, and src-tauri/ folders into
GitHub's Add file → Upload files. 8 files total.

NEXT BUILD WILL BE SLOWER THAN USUAL. The first run with the
bundled-launcher workflow has to compile the Android APK from scratch
(~5 extra minutes). After that, gradle caches kick in.
