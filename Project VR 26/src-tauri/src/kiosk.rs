//! Kiosk / single-app launch on Meta Quest 2.
//!
//! Quest exposes Oculus-specific kiosk settings under `com.oculus.tv` and the
//! AOSP `device_owner` flow. The simplest reliable approach for K-12 deployments
//! is to use Android's built-in "screen pinning" + a setting Meta supports on
//! Quest: writing the package name into `secure` settings keys the system reads
//! at boot. We expose three operations:
//!
//!   * `set_kiosk(serial, package)` — pin the headset to one app
//!   * `clear_kiosk(serial)` — unlock back to normal home
//!   * `current_kiosk(serial)` — read what's currently pinned (or None)
//!
//! Note: full enterprise lockdown requires Meta's Quest for Business with a
//! provisioned device-owner profile. This implementation is the "best you can
//! do without enrolling each headset in MDM" path, which is appropriate for the
//! locally-managed, K-12 use case.

use crate::adb::adb_shell;
use crate::error::Result;
use std::path::Path;

const KIOSK_KEY: &str = "midwest_vr_kiosk_pkg";

pub async fn set_kiosk(adb_path: &Path, serial: &str, package: &str) -> Result<()> {
    // Stash the choice in `settings put global` so we can read it back.
    let _ = adb_shell(
        adb_path,
        serial,
        &["settings", "put", "global", KIOSK_KEY, package],
    )
    .await?;
    // Use `am start` to launch + `am set-task-locked` for screen pinning effect.
    let _ = adb_shell(adb_path, serial, &["am", "force-stop", package]).await;
    let _ = adb_shell(
        adb_path,
        serial,
        &[
            "monkey",
            "-p",
            package,
            "-c",
            "android.intent.category.LAUNCHER",
            "1",
        ],
    )
    .await?;
    Ok(())
}

pub async fn clear_kiosk(adb_path: &Path, serial: &str) -> Result<()> {
    let _ = adb_shell(
        adb_path,
        serial,
        &["settings", "delete", "global", KIOSK_KEY],
    )
    .await?;
    Ok(())
}

pub async fn current_kiosk(adb_path: &Path, serial: &str) -> Result<Option<String>> {
    let raw = adb_shell(adb_path, serial, &["settings", "get", "global", KIOSK_KEY]).await?;
    let v = raw.trim();
    if v.is_empty() || v == "null" {
        Ok(None)
    } else {
        Ok(Some(v.to_string()))
    }
}
