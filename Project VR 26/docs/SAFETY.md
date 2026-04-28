# Safety, privacy, and IT-policy considerations for MidWest-VR

This is the document to share with your IT department if they ask about
running MidWest-VR on a managed work Mac. It's deliberately specific so
they can audit it.

## TL;DR

MidWest-VR is a self-contained desktop app shipped on an external SSD.
On your work Mac it launches as a normal user-space app, requires no
admin password, makes no network calls of its own, and writes only to
its own config file on the SSD. Compilation of the app happens on a
separate Mac (not the work Mac), so the work Mac never sees a build
toolchain or a system-wide install.

## What gets installed where, by phase

### Phase 1: One-time Setup (on a *non-work* Mac)

The `bootstrap.sh` script installs build tools to standard, well-known
locations on the *Setup* Mac only:

| Tool | Path | Purpose | Source |
|---|---|---|---|
| Xcode Command Line Tools | `/Library/Developer/CommandLineTools/` | Compiler + linker (Apple) | Apple, via `xcode-select --install` |
| Homebrew | `/opt/homebrew` | Package manager (Apple Silicon) | brew.sh, official installer |
| Node.js 22 | `/opt/homebrew/Cellar/node@22/...` | JS runtime for the build step | nodejs.org via Homebrew formula |
| pnpm | `/opt/homebrew/bin/pnpm` | JS package manager | pnpm.io via Homebrew formula |
| rustup | `~/.rustup` and `~/.cargo` | Rust toolchain installer | rust-lang.org official installer |
| Tauri CLI | `~/.cargo/bin/cargo-tauri` | Tauri's command-line tool | crates.io official |

These are all open-source, audited, widely-used developer tools. If your
*Setup* Mac is also managed by IT, you'll want to confirm none of the
above is restricted before running Setup there.

### Phase 2: Compile (on the same non-work Mac)

`build-portable.sh` runs the Rust + Vite compilers locally. No new
system installs happen. The output is a single `.app` bundle written to
the SSD. Build artifacts (.o files, etc.) are kept inside
`src-tauri/target/` on whichever drive holds the project folder.

### Phase 3: Runtime (on your work Mac)

Plugging the SSD into your work Mac and double-clicking
`MidWest-VR.app` does the following:

- macOS Gatekeeper verifies the bundle's ad-hoc signature. The first
  launch may show "unidentified developer" — right-click → Open → Open
  approves it once, after which the prompt doesn't return.
- The app loads as a normal user-space process. No `sudo`, no
  installer, no daemon registered.
- The app reads/writes exactly one file outside the SSD folder: nothing.
  All config is written to `MidWest-VR.config.json` next to the
  `.app` on the SSD.
- The app spawns `adb` (the bundled binary inside
  `MidWest-VR.app/Contents/Resources/adb-tools/`) when you ask it to do
  anything device-related.

## Network behavior at runtime

**By default, the app makes zero outgoing network connections.** It does
not phone home, check for updates, log telemetry, or fetch ads. The
"Online catalog" toggle in Settings is **OFF by default**.

`adb`, when running, listens on `127.0.0.1:5037` (the standard ADB
server port — localhost only). It also opens USB connections to
attached Android-class devices (your Quest 2 headsets). It does not
make outbound network connections.

### Optional: Discover / online catalog

When the user explicitly enables **Settings → Online catalog**, the app
makes outbound HTTPS requests, but **only to a hardcoded allowlist**
defined in `src-tauri/src/network.rs`:

- `raw.githubusercontent.com` — fetches the curated catalog JSON
- `github.com` and `objects.githubusercontent.com` — direct APK downloads
  for open-source apps in the catalog (e.g. Open Brush)
- `cdn.sidequestvr.com` and `files.sidequestvr.com` — APK downloads
  for SideQuest-distributed reputable apps
- `dl.google.com` — already used to obtain the bundled `adb`

**Anything not on this list is rejected at the network layer** before
any socket opens. The allowlist is hardcoded in Rust and is not
configurable from the frontend or settings file. Every outbound
request — allowed or rejected — is recorded in an in-memory ring buffer
that the user (and IT) can audit live in Settings → Network activity log.

In addition, the **webview itself** is locked down via Content Security
Policy (CSP). Image loads (catalog thumbnails, screenshots) are limited
to a small set of public-image hosts:

- `raw.githubusercontent.com` (open-source repo banners)
- `github.com` and `objects.githubusercontent.com`
- `upload.wikimedia.org` (Wikipedia / Wikimedia Commons)
- `cdn.sidequestvr.com`, `files.sidequestvr.com`

Any other image source is silently dropped by the browser engine,
not just by Rust. `script-src` is `'self' 'unsafe-inline'` only —
no third-party JavaScript is permitted. There is no remote eval.

**Things the app still does NOT do, even with the catalog enabled:**

- No telemetry, analytics, error reporting, or session tracking.
- No accounts, sign-in, email collection, or PII of any kind.
- No automatic updates of MidWest-VR itself.
- No outbound traffic when the toggle is OFF.

All APK downloads are SHA256-verified against the catalog's expected
hash before being installed onto a headset.

Some EDR tools may log the `adb` process starting and notice the
loopback bind. This is expected behavior of the standard Android
Debug Bridge tool; the binary we ship is a verbatim copy of Google's
`platform-tools` `adb` (you can verify by running
`shasum -a 256 <path-to-adb>` and comparing to Google's published
hash).

## Filesystem behavior at runtime

| Action | Path | When |
|---|---|---|
| Read | `/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app/Contents/Resources/adb-tools/adb` | When you click anything device-related |
| Read | `/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.config.json` | At launch |
| Write | `/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.config.json` | When you change settings |
| Write | `/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app/Contents/Resources/adb-tools/.adb_keys/` | First adb launch, generates RSA key for headset trust |
| Read | APK file you pick from a Finder dialog | When you click "Install APK…" |

That's all. The app does not touch:
- `~/Library`, `~/Documents`, `/Applications`, `/usr/local`, `/private/etc`
- iCloud, the keychain, system settings, network configuration
- Any file outside the SSD folder unless you explicitly pick one

## Permissions macOS may ask for

- **Gatekeeper "unidentified developer"** — first launch only,
  one-time approve. No admin needed.
- **USB Accessories permission** (System Settings → Privacy &
  Security → USB Accessories) — macOS Sonoma and later prompt the
  first time a USB peripheral is connected. Allowing this is the
  same permission you'd grant for any other USB device.

The app does NOT request:
- Full Disk Access
- Accessibility
- Screen Recording
- Camera/Microphone
- Network access (it doesn't need it)

## What MDM / restrictions might block

If your work Mac is managed via Jamf, Mosyle, Kandji, or similar, IT
may have configured policies that affect MidWest-VR:

- **USB Accessories blocked** — would prevent connecting the SSD itself
  or the Quest 2 headsets. Talk to IT.
- **Gatekeeper hardened** — may not allow ad-hoc-signed apps even with
  right-click → Open. Talk to IT or get a Developer ID build (see
  PORTABLE_SSD.md).
- **EDR with USB / device-debugging blocking** — uncommon but possible.
- **System Integrity Protection** policies — irrelevant; we don't
  modify any protected paths.

## What we'd suggest you tell IT

A short email template:

> I'd like to use MidWest-VR (an open-source-style local Quest 2 fleet
> manager) on my work Mac. It runs entirely from a USB-C SSD I'll
> bring in. Specifically:
>
> - The app is compiled on my home Mac, not the work Mac.
> - On the work Mac it runs in user space — no installer, no admin,
>   no system changes.
> - The optional "Discover" feature, if I enable it, makes outbound
>   HTTPS requests only to a hardcoded allowlist (raw.githubusercontent.com,
>   github.com, objects.githubusercontent.com, cdn.sidequestvr.com,
>   files.sidequestvr.com, dl.google.com). All other outbound traffic is
>   rejected at the application layer. No telemetry, accounts, or PII.
> - With Discover disabled, the app makes zero outbound connections.
> - It uses `adb` (the standard Android USB tool) bundled inside its
>   app bundle. ADB binds to 127.0.0.1:5037 and talks to USB-attached
>   Meta Quest 2 headsets only.
> - All app config and the network activity log live on my SSD or in
>   memory — never sent off-device.
>
> I'd appreciate confirmation that USB Accessories permission and
> Gatekeeper "right-click → Open" are allowed by current policy, and
> that ADB is not on a deny-list for endpoint security.

## Verifying the bundle yourself (or with IT)

```bash
# What's the hash of the adb shipped inside the bundle?
shasum -a 256 "/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app/Contents/Resources/adb-tools/adb"

# What's the signature?
codesign -dv --verbose=4 "/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app"

# What's inside the bundle?
ls -la "/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app/Contents/MacOS"
ls -la "/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app/Contents/Resources"

# What dylibs does the main binary link?
otool -L "/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app/Contents/MacOS/midwest-vr"
```

Everything in the bundle is open-source and the source is right there
in the same folder you copied to the SSD (under `src/` and `src-tauri/`)
if anyone wants to read it.

## Removing all traces

To remove MidWest-VR from your work Mac:

1. Quit the app if running.
2. Eject and unplug the SSD.

That's it. Nothing remains on the work Mac. (You may have a
"recently launched" entry in Finder's Recents — that clears itself
over time, or use **Finder → File → Clear Recent Items**.)

To remove the build tools from the *Setup* Mac (if that was a
borrowed Mac you want to clean up):

```bash
# Rust
rustup self uninstall

# Tauri CLI
cargo uninstall tauri-cli || true

# Homebrew (and everything installed via brew, including Node and pnpm)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)"

# Xcode Command Line Tools
sudo rm -rf /Library/Developer/CommandLineTools
```

The above leaves the borrowed Mac as it was before Setup.
