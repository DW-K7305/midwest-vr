# MidWest-VR

A locally-managed, ManageXR-style desktop app for fleets of Meta Quest 2 headsets.
Built with Tauri 2 + React + Rust. Runs natively on Apple Silicon. Designed to live on
an external SSD and travel between machines.

## What it does (v1)

- **Device dashboard** — auto-detects Quest 2s on USB, shows live battery, storage, serial, firmware, online status.
- **App management** — drag-drop sideload APKs, list installed packages, uninstall, pin versions.
- **Kiosk mode** — lock a headset to a single app on boot.
- **Wi-Fi provisioning** — push SSID/PSK to one or many headsets in one click.
- **Portable** — runs from `/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app` with config stored next to the bundle.

## First-time setup (one command)

Open Terminal, `cd` into this folder, then:

```bash
./bootstrap.sh
```

It installs (only what's missing): Xcode Command Line Tools, Homebrew, Node 22, pnpm,
rustup + Rust stable with the `aarch64-apple-darwin` target, and the Tauri CLI. Then it
downloads `adb` from Google's official `platform-tools` and drops it into
`src-tauri/resources/adb-tools/` so it gets bundled inside the `.app`.

When it finishes, run:

```bash
pnpm install
pnpm tauri dev          # hot-reloading dev build
```

## Producing a portable build (lives on your SanDisk SSD)

```bash
./build-portable.sh
```

This:

1. Runs `pnpm tauri build --target aarch64-apple-darwin`.
2. Ad-hoc signs the bundle with `codesign --force --deep --sign -`.
3. Strips macOS quarantine attributes (`xattr -dr com.apple.quarantine`).
4. Optionally copies `MidWest-VR.app` to a path you pass as the first argument:
   ```bash
   ./build-portable.sh "/Volumes/SandSpd-EX/MidWest-VR/MidWest-VR.app"
   ```

The first time you launch the `.app` from the SSD on your Mac, macOS may still prompt
because it's ad-hoc signed (no Apple Developer ID). Right-click → Open → Open. After
that one prompt, it launches like any other app, and config will be written next to
`MidWest-VR.app` on the SSD instead of `~/Library/Application Support/MidWest-VR/`.

## Project layout

```
.
├── bootstrap.sh             # one-shot Mac toolchain installer
├── build-portable.sh        # build + sign + (optional) copy to SSD
├── package.json             # frontend deps
├── vite.config.ts           # Vite config
├── tailwind.config.js       # Tailwind v3
├── index.html               # Vite entry
├── src/                     # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── lib/                 # tauri client, helpers
│   ├── components/          # ui primitives + composed widgets
│   ├── pages/               # Dashboard / Apps / Kiosk / Wi-Fi / Settings
│   ├── hooks/               # useDevices, etc.
│   └── types.ts
└── src-tauri/               # Rust backend
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── build.rs             # bundles resources
    ├── capabilities/        # Tauri 2 permission grants
    ├── icons/               # macOS app icons
    ├── resources/adb-tools/ # adb binary, populated by bootstrap.sh
    └── src/
        ├── main.rs
        ├── lib.rs           # tauri::Builder + commands
        ├── adb.rs           # adb subprocess wrapper
        ├── devices.rs       # device discovery + vitals
        ├── apps.rs          # install/uninstall/list packages
        ├── kiosk.rs         # single-app launch mode
        ├── wifi.rs          # Wi-Fi provisioning
        ├── settings.rs      # portable-mode config resolver
        └── error.rs
```

## Why this stack is bulletproof for a portable SSD app

- **Bundled adb** — no PATH dependency, no Homebrew dependency. The `.app` is self-contained.
- **No keychain dependence** — config is plain JSON next to the bundle when in portable mode.
- **No code-signing dependency at runtime** — ad-hoc signing means the binary is internally
  consistent; macOS won't kill it for tampering when it crosses volumes.
- **Apple Silicon native** — single-arch build is smaller and faster than universal.
- **Tauri 2** — ~12 MB binary footprint vs. ~120 MB for Electron equivalents.

See `docs/PORTABLE_SSD.md` for the full rationale and edge cases.
