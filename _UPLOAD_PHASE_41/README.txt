MidWest-VR — Phase 41 (3 files).

THE FIX: Bulletproof wireless self-heal on USB re-arrival.

Before this round: pair a headset over USB → headset reboots later
→ its TCP/IP daemon dies and/or its DHCP IP changes → app's saved
IP is stale → "Connect" times out forever, no recovery.

After this round: same scenario → plug headset into USB at any time
→ background loop detects it on USB, sees the saved IP is dead, runs
the pair flow again silently, captures the new IP, updates settings,
unplugs back into wireless. No button press required.

The Wireless Panel on the Dashboard now also shows clearer status
per paired headset: "Online" / "Healing… (on USB)" / "offline — IP
may have changed" so you always know what state you're in. Error
messages from failed wireless connects are translated into plain
English with the actual fix instructions.

UPLOAD:
  Drag the inner src/ and src-tauri/ folders into GitHub's
  "Add file → Upload files." 3 files total. One commit.
