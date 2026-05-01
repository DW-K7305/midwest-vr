MidWest-VR — Phase 42 (9 files).

THE FIXES IN THIS ROUND:

1. mDNS / Bonjour discovery (NEW). The Wireless ADB section now has a
   "Find on this network" button. Click it after moving to a different
   building / Wi-Fi — the app scans the local network for your paired
   headsets via mDNS, identifies each by its real serial, and updates
   the saved IP. No USB plug-in needed when you change locations.

   Backend: new mdns-sd Rust crate, new mdns_discovery module, two new
   commands wireless_discover_local + wireless_relocate.

2. Headset-side persistent wireless ADB. When you pair a headset over
   USB, the app now also flips Android's adb_wifi_enabled global
   setting. Net effect: the HEADSET itself self-heals after reboot —
   wireless ADB comes back online ~30 seconds after every cold boot
   without you doing anything. Combined with the Mac-side auto-heal
   from Phase 41, wireless is now bulletproof in BOTH directions.

3. Catalog error UX fix. The "no apk_url in catalog entry open-brush"
   error you saw is replaced with a helpful sentence pointing to
   GitHub releases. Open Brush + Multibrush are still flagged as
   recommended, the Recommended Pack still includes them.

UPLOAD: drag the inner src/ + src-tauri/ + catalog/ folders into
GitHub's Add file → Upload files. 9 files total. One commit.

NOTE: This adds a new Rust dependency (mdns-sd). The first build
after this upload will take a few extra minutes to compile it for
the first time. Subsequent builds will be back to normal speed.
