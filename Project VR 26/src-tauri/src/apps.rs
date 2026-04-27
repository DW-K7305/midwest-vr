//! Per-device app management: list, install, uninstall.

use crate::adb::{adb_install_streaming, adb_shell};
use crate::error::Result;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
pub struct InstalledApp {
    pub package: String,
    pub version_name: Option<String>,
    pub version_code: Option<i64>,
    pub label: Option<String>,
    pub is_system: bool,
    pub apk_path: Option<String>,
}

/// List third-party packages on the device. We exclude system packages by default
/// since Quest has hundreds of system services no one wants to scroll through.
pub async fn list(adb_path: &Path, serial: &str, include_system: bool) -> Result<Vec<InstalledApp>> {
    // pm list packages -3 -f → "package:/data/app/<path>=<package>"
    let parts: Vec<&str> = if include_system {
        vec!["pm", "list", "packages", "-f"]
    } else {
        vec!["pm", "list", "packages", "-3", "-f"]
    };
    let raw = adb_shell(adb_path, serial, &parts).await?;
    let mut apps = Vec::new();
    for line in raw.lines() {
        if let Some(rest) = line.strip_prefix("package:") {
            // Format: <apk path>=<package>
            if let Some(eq) = rest.rfind('=') {
                let apk_path = rest[..eq].to_string();
                let pkg = rest[eq + 1..].to_string();
                apps.push(InstalledApp {
                    package: pkg,
                    version_name: None,
                    version_code: None,
                    label: None,
                    is_system: !apk_path.starts_with("/data/"),
                    apk_path: Some(apk_path),
                });
            }
        }
    }
    Ok(apps)
}

/// Get version info for a single package via `dumpsys package`.
pub async fn version_info(
    adb_path: &Path,
    serial: &str,
    package: &str,
) -> Result<(Option<String>, Option<i64>)> {
    let raw = adb_shell(adb_path, serial, &["dumpsys", "package", package]).await?;
    let mut version_name = None;
    let mut version_code = None;
    for line in raw.lines() {
        let l = line.trim();
        if let Some(v) = l.strip_prefix("versionName=") {
            version_name = Some(v.to_string());
        } else if let Some(v) = l.strip_prefix("versionCode=") {
            // Format: versionCode=12345 minSdk=...
            let n = v.split_whitespace().next().unwrap_or("");
            version_code = n.parse().ok();
        }
    }
    Ok((version_name, version_code))
}

pub async fn install<F: FnMut(&str)>(
    adb_path: &Path,
    serial: &str,
    apk: &Path,
    on_progress: F,
) -> Result<()> {
    adb_install_streaming(adb_path, serial, apk, on_progress).await
}

pub async fn uninstall(adb_path: &Path, serial: &str, package: &str) -> Result<()> {
    let _ = adb_shell(adb_path, serial, &["pm", "uninstall", package]).await?;
    Ok(())
}

pub async fn launch(adb_path: &Path, serial: &str, package: &str) -> Result<()> {
    // monkey -p <pkg> -c android.intent.category.LAUNCHER 1
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

pub async fn force_stop(adb_path: &Path, serial: &str, package: &str) -> Result<()> {
    let _ = adb_shell(adb_path, serial, &["am", "force-stop", package]).await?;
    Ok(())
}
