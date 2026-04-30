MidWest-VR — files changed in Phase 38 + Phase 39 (16 total).

These mirror exactly where they live in the real project, so you can:
  • Drag the inner src/ and src-tauri/ folders straight into GitHub's
    "Add file → Upload files" form (folder upload preserves structure), OR
  • Drag this whole _UPLOAD_THESE_FILES folder OUT of the project into
    your Documents folder (so it's a sibling, not a child), then upload
    from there to keep the project folder clean.

After GitHub commits, the workflow runs automatically. Wait for the green
check, download the new artifact from Actions → newest run → Artifacts,
unzip, replace the .app on your SSD.

Bundle contents:

  src/App.tsx
  src/components/DevicePicker.tsx
  src/components/Sidebar.tsx
  src/components/SubNav.tsx          (NEW)
  src/components/TitleBar.tsx
  src/components/WirelessPanel.tsx   (NEW)
  src/pages/Apps.tsx
  src/pages/Connect.tsx
  src/pages/Dashboard.tsx
  src/pages/Discover.tsx
  src/pages/Launcher.tsx
  src/pages/Setup.tsx
  src/pages/Stores.tsx
  src/pages/WiFi.tsx
  src/pages/Wireless.tsx
  src-tauri/src/lib.rs

If GitHub's web upload still misbehaves, try uploading these subfolders
one at a time: src/components/ first, then src/pages/, then the two
single files (src/App.tsx and src-tauri/src/lib.rs).
