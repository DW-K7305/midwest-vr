# Running MidWest-VR from an external SSD

MidWest-VR is built to live on a portable drive (your SanDisk SSD) and travel
between machines. This document covers how it works, the gotchas macOS throws at
external-volume apps, and the trade-offs of running unsigned vs. ad-hoc-signed
vs. Apple-Developer-ID-signed.

## Quick path

1. On the Mac you want to build on, run `./bootstrap.sh` once.
2. Plug in the SSD.
3. Run `./build-portable.sh "/Volumes/SandSpd-EX"` (replace with whatever your SSD
   shows up as in Finder — see `ls /Volumes/`).
4. To launch later: open Finder, navigate to the SSD, double-click
   `MidWest-VR.app`. The very first launch on each Mac asks "are you sure?" — pick
   **Open**. Subsequent launches are silent.

## How portable mode is detected

At startup, MidWest-VR checks `std::env::current_exe()` (the path to its own
binary). If that path begins with `/Volumes/`, MidWest-VR enters portable mode and
writes its `MidWest-VR.config.json` next to the `.app` bundle on the SSD. If not,
it uses `~/Library/Application Support/MidWest-VR/config.json`.

This means: no manual setting, no migration step. Plug in the SSD, launch the
`.app`, and your settings come along. Move it to `/Applications`, and the
system-standard path takes over.

You can override this in **Settings → Storage → Config dir override** if you
want both — say, the SSD-resident `.app` writing into your home directory.

## The Gatekeeper situation

macOS treats binaries crossing volume boundaries with extra scrutiny. Three
signing options, in order of friction:

### Apple Developer ID signing ($99/year)

The friendly path. After `codesign --sign "Developer ID Application: …"` and
`xcrun notarytool submit`, macOS will silently launch the `.app` from the SSD on
*any* Mac. We don't do this in v1 because you don't have a Developer ID account.

### Ad-hoc signing (`codesign --sign -`) — what we do

The signature is internally consistent — macOS verifies the bundle hasn't been
tampered with — but isn't tied to a known publisher. This is enough that:

- The app launches fine on **the same Mac** that built it after the first
  right-click → Open prompt.
- The app launches with a one-time prompt on **other Macs** (right-click → Open
  → Open). After that one-time approval, it's silent forever.
- The app does **not** trigger Gatekeeper kills mid-session when it crosses
  volume boundaries (that's the failure mode of fully-unsigned apps copied to
  external drives).

Each `build-portable.sh` run also strips the quarantine attribute (`xattr -dr
com.apple.quarantine MidWest-VR.app`) so even the first-launch prompt is usually
skipped on the build machine.

### No signing

Fastest to build, but macOS will refuse to launch from `/Volumes/` on
non-build Macs without manual `xattr` work, and will sometimes silently kill
the process at runtime. Not recommended.

## Why aarch64-only

We target `aarch64-apple-darwin` (Apple Silicon native), not a universal binary,
because:

1. Your M4 Air doesn't need an x86_64 slice.
2. Universal2 builds are ~2× the size on disk, which matters when the binary
   lives on a portable drive that's also serving classroom content.
3. Building takes half as long.

If you ever need to run on an Intel Mac, change the line in `build-portable.sh`
to `--target universal-apple-darwin` and re-run `bootstrap.sh` to add the
`x86_64-apple-darwin` Rust target.

## Why the bundled adb

The `.app` ships its own `adb` binary inside `Contents/Resources/adb-tools/adb`.
Reasons:

- No PATH dependency on the host Mac. You can plug the SSD into a teacher's
  brand-new MacBook that's never seen Homebrew, double-click the `.app`, and
  it just works.
- Same adb version everywhere. Tracking down "works on my machine" issues that
  are really an `adb 30 vs 35` mismatch is not how you want to spend your week.
- Future-proof against macOS revoking system-bundled tools.

The trade-off is +2 MB on the bundle. We think that's fair.

## Updating

To pull a new build onto the SSD, just re-run `./build-portable.sh
"/Volumes/<ssd>"`. The script `rm -rf`s the existing `.app` first (it's
self-contained, so this is safe) and writes a fresh copy via `ditto`. The
config file living next to the bundle is left alone — your settings persist.

## Edge cases

- **Multiple SSDs**: macOS mounts each at `/Volumes/<volume-name>`. MidWest-VR
  uses *whichever volume the executable lives on* as the portable root.
- **Volume name collisions**: macOS appends `-1`, `-2`, etc., automatically.
  MidWest-VR follows the actual mount path so this doesn't matter.
- **First-Aid / fsck**: if the SSD gets unplugged mid-write, `MidWest-VR.config.json`
  may end up partially written. MidWest-VR handles unparseable JSON by falling
  back to defaults (it does *not* delete the broken file — you can inspect it).
- **APFS vs. ExFAT**: Recommended is **APFS (Encrypted)** for the SSD, so the
  config and any bundled APKs are at-rest encrypted. ExFAT works but won't preserve
  Unix `+x` permissions; if you go that route, run `chmod -R +x` on the bundled
  binaries after copying.
