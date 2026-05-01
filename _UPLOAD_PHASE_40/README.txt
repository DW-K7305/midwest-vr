MidWest-VR — Phase 40 bundle (21 files).

This folder includes every file changed across Phases 38, 39, and 40
since your last successful GitHub upload. Phase 40 is the marquee
feature: ENROLLMENT PROFILES.

WHAT'S NEW:
  Profiles page (sidebar → Profiles).
  Save a setup once: name + Wi-Fi + apps to install + apps to remove
  + kiosk lock + launcher config. Apply to any plugged-in headset
  with one click. Live step-by-step progress shown. Replaces the
  manual N-step setup checklist.

  Two new Rust files (profile.rs, settings.rs change), one new TS
  page (Profiles.tsx), and minor wiring in lib.rs + App.tsx +
  Sidebar.tsx + types.ts + tauri.ts.

UPLOAD:
  Drag the inner src/ and src-tauri/ folders into GitHub's
  "Add file → Upload files." One commit covers all 21 files.

  If drag-drop misbehaves, do it in chunks:
    1. src/components/   (5 files)
    2. src/pages/        (10 files)
    3. src/lib/          (1 file)
    4. The singletons:   src/App.tsx, src/types.ts,
                         src-tauri/src/lib.rs,
                         src-tauri/src/profile.rs,
                         src-tauri/src/settings.rs

If GitHub web upload still misbehaves, press "." (period) on the
repo page to open github.dev (full VS Code in browser) and paste.
