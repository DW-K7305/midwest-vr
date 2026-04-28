//! Kiosk / single-app lockdown for Meta Quest 2.
//!
//! Quest doesn't ship with a real "kiosk mode" the way enterprise Android does,
//! and the official enterprise lock requires Meta's Quest for Business with a
//! provisioned device-owner profile. For a school-IT, locally-managed fleet
//! that is the wrong tool — too much MDM ceremony per headset.
//!
//! Instead we lean on the MidWest-VR Launcher APK (Phase 27/28). Two pieces:
//!
//!   1. We set our launcher as the system home activity via
//!      `cmd package set-home-activity`. After that, every press of the home
//!      button drops the user into our launcher.
//!   2. We write `kiosk_app: <package>` into the launcher's `launcher_config.json`.
//!      The launcher reads this on resume; if it's set, it immediately re-launches
//!      that package instead of showing its grid. Net effect: a student
//!      pressing home flickers through our launcher for a frame and then lands
//!      back in the locked app. They cannot escape it without the desktop app
//!      clearing the field.
//!
//! Clearing the kiosk just removes `kiosk_app` from the JSON. The launcher
//! falls back to its normal allowlist grid. (We deliberately do NOT restore
//! Quest's stock home — keeping our launcher as home gives us re-entry into
//! kiosk on the next class without any setup.)
//!
//! This module assumes the launcher APK is already installed on the headset.
//! Callers should check `launcher::is_installed` first; the frontend Class
//! Mode page does this and prompts the user to push the launcher if it's
//! missing.

use crate::adb::adb_shell;
use crate::error::{AppError, Result};
use crate::launcher::{
    self, set_as_home_activity, LauncherConfig, LAUNCHER_PACKAGE,
};
use std::path::Path;

/// Lock a single headset to a single app.
///
/// Steps (all idempotent, safe to re-run):
///   1. Make sure the launcher APK is installed (caller guarantees this; we
///      double-check and fail fast otherwise).
///   2. Pull the headset's existing launcher_config.json (or default if none).
///   3. Set `kiosk_app = Some(package)` and push the JSON back.
///   4. Set our launcher as the system home activity.
///   5. Force-launch the kiosk app immediately so the student is dropped into
///      it without needing to touch the headset.
pub async fn set_kiosk(adb_path: &Path, serial: &str, package: &str) -> Result<()> {
    if !launcher::is_installed(adb_path, serial).await.unwrap_or(false) {
        return Err(AppError::Config(format!(
            "MidWest-VR Launcher isn't installed on {serial}. Push it first from Class Mode → Install Launcher."
        )));
    }
    let mut cfg = launcher::read_remote_config(adb_path, serial)
        .await
        .unwrap_or_default();
    cfg.kiosk_app = Some(package.to_string());
    launcher::write_remote_config(adb_path, serial, &cfg).await?;
    let _ = set_as_home_activity(adb_path, serial).await;

    // Drop the student straight into the locked app. force-stop first so the
    // new launch is a clean cold start (cleans up any half-state from the
    // previous app the student was in).
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

/// Unlock a single headset. Removes the kiosk_app field; leaves our launcher
/// as home so re-entering kiosk later is a single field write.
pub async fn clear_kiosk(adb_path: &Path, serial: &str) -> Result<()> {
    if !launcher::is_installed(adb_path, serial).await.unwrap_or(false) {
        // Nothing to unlock if the launcher isn't there. Treat as a no-op so
        // the UI doesn't get stuck in a "can't clear" state on partially-set-up
        // headsets.
        return Ok(());
    }
    let mut cfg = launcher::read_remote_config(adb_path, serial)
        .await
        .unwrap_or_default();
    cfg.kiosk_app = None;
    launcher::write_remote_config(adb_path, serial, &cfg).await?;
    // Bring the student back to the launcher grid so they see the change
    // without taking the headset off.
    let _ = adb_shell(
        adb_path,
        serial,
        &[
            "monkey",
            "-p",
            LAUNCHER_PACKAGE,
            "-c",
            "android.intent.category.LAUNCHER",
            "1",
        ],
    )
    .await;
    Ok(())
}

/// Read which app (if any) is currently kiosk-locked on this headset.
/// Returns None if our launcher isn't installed or no kiosk_app is set.
pub async fn current_kiosk(adb_path: &Path, serial: &str) -> Result<Option<String>> {
    if !launcher::is_installed(adb_path, serial).await.unwrap_or(false) {
        return Ok(None);
    }
    let cfg: LauncherConfig = launcher::read_remote_config(adb_path, serial)
        .await
        .unwrap_or_default();
    Ok(cfg.kiosk_app)
}

/// Bulk variant — set the same kiosk app across many headsets sequentially.
/// Stops on the first hard failure but reports all completions; designed for
/// "Lock all my headsets to this app" Class Mode flow.
pub async fn set_kiosk_many(
    adb_path: &Path,
    serials: &[String],
    package: &str,
) -> Vec<KioskResult> {
    let mut results = Vec::with_capacity(serials.len());
    for serial in serials {
        match set_kiosk(adb_path, serial, package).await {
            Ok(()) => results.push(KioskResult {
                serial: serial.clone(),
                ok: true,
                error: None,
            }),
            Err(e) => results.push(KioskResult {
                serial: serial.clone(),
                ok: false,
                error: Some(e.to_string()),
            }),
        }
    }
    results
}

/// Bulk variant — clear kiosk across many headsets.
pub async fn clear_kiosk_many(adb_path: &Path, serials: &[String]) -> Vec<KioskResult> {
    let mut results = Vec::with_capacity(serials.len());
    for serial in serials {
        match clear_kiosk(adb_path, serial).await {
            Ok(()) => results.push(KioskResult {
                serial: serial.clone(),
                ok: true,
                error: None,
            }),
            Err(e) => results.push(KioskResult {
                serial: serial.clone(),
                ok: false,
                error: Some(e.to_string()),
            }),
        }
    }
    results
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct KioskResult {
    pub serial: String,
    pub ok: bool,
    pub error: Option<String>,
}
