//! Push the MidWest-VR Launcher APK + a launcher_config.json onto a fleet of
//! headsets in one shot. Optional set-as-home call (requires user confirmation
//! on the headset).

use crate::adb::{adb_push, adb_shell};
use crate::apps;
use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Schema written to /sdcard/Android/data/com.midwestvr.launcher/files/launcher_config.json
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct LauncherConfig {
    #[serde(default)]
    pub school_name: String,
    #[serde(default)]
    pub greeting: String,
    #[serde(default)]
    pub include_system: bool,
    #[serde(default)]
    pub allowlist: Vec<String>,
    /// When set, our launcher refuses to show its grid and instead immediately
    /// (re-)launches this single package. Combined with `set-home-activity`
    /// pointing at our launcher, this is the kiosk lock for the Quest 2:
    /// pressing the home button bounces the student straight back to the locked
    /// app. To exit kiosk, an admin clears this field via the desktop app.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kiosk_app: Option<String>,
}

pub const REMOTE_DIR: &str = "/sdcard/Android/data/com.midwestvr.launcher/files";
pub const REMOTE_PATH: &str = "/sdcard/Android/data/com.midwestvr.launcher/files/launcher_config.json";
pub const LAUNCHER_PACKAGE: &str = "com.midwestvr.launcher";

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PushEvent {
    HeadsetStart { serial: String },
    HeadsetInstall { serial: String },
    HeadsetConfig { serial: String },
    HeadsetSetHome { serial: String },
    HeadsetDone { serial: String },
    HeadsetFail { serial: String, error: String },
}

/// Push the launcher APK + config JSON to one headset.
pub async fn push_one(
    adb_path: &Path,
    serial: &str,
    apk_path: &Path,
    cfg: &LauncherConfig,
    set_as_home: bool,
) -> Result<()> {
    // 1. Install / reinstall the APK.
    apps::install(adb_path, serial, apk_path, |_| {}).await?;

    // 2. Make sure the target dir exists on the headset.
    let _ = adb_shell(adb_path, serial, &["mkdir", "-p", REMOTE_DIR]).await;

    // 3. Stage the config JSON in the OS temp dir, then adb push it.
    let tmp_path: PathBuf = std::env::temp_dir().join(format!("midwestvr_launcher_{}.json", serial));
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| AppError::Config(format!("config serialize: {e}")))?;
    tokio::fs::write(&tmp_path, json).await?;
    adb_push(adb_path, serial, &tmp_path, REMOTE_PATH).await?;
    let _ = tokio::fs::remove_file(&tmp_path).await;

    // 4. Optionally try to set this APK as the system launcher.
    // Quest 2 may prompt the user inside the headset to confirm the change.
    if set_as_home {
        let _ = adb_shell(
            adb_path,
            serial,
            &[
                "cmd",
                "package",
                "set-home-activity",
                &format!("{}/.MainActivity", LAUNCHER_PACKAGE),
            ],
        )
        .await;
    }

    Ok(())
}

/// Sequential per-headset push with event reporting (parallel adb installs over
/// USB are flaky on Quest 2).
pub async fn push_many<F>(
    adb_path: &Path,
    serials: &[String],
    apk_path: &Path,
    cfg: &LauncherConfig,
    set_as_home: bool,
    mut emit: F,
) -> Result<()>
where
    F: FnMut(PushEvent),
{
    if !apk_path.exists() {
        return Err(AppError::Config(format!(
            "Launcher APK not found at {}",
            apk_path.display()
        )));
    }
    for serial in serials {
        emit(PushEvent::HeadsetStart {
            serial: serial.clone(),
        });
        emit(PushEvent::HeadsetInstall {
            serial: serial.clone(),
        });
        match apps::install(adb_path, serial, apk_path, |_| {}).await {
            Ok(_) => {}
            Err(e) => {
                emit(PushEvent::HeadsetFail {
                    serial: serial.clone(),
                    error: format!("install: {e}"),
                });
                continue;
            }
        }
        emit(PushEvent::HeadsetConfig {
            serial: serial.clone(),
        });
        let _ = adb_shell(adb_path, serial, &["mkdir", "-p", REMOTE_DIR]).await;
        let tmp_path: PathBuf = std::env::temp_dir().join(format!("midwestvr_launcher_{}.json", serial));
        let json = match serde_json::to_string_pretty(cfg) {
            Ok(s) => s,
            Err(e) => {
                emit(PushEvent::HeadsetFail {
                    serial: serial.clone(),
                    error: format!("config serialize: {e}"),
                });
                continue;
            }
        };
        if let Err(e) = tokio::fs::write(&tmp_path, json).await {
            emit(PushEvent::HeadsetFail {
                serial: serial.clone(),
                error: format!("temp write: {e}"),
            });
            continue;
        }
        if let Err(e) = adb_push(adb_path, serial, &tmp_path, REMOTE_PATH).await {
            emit(PushEvent::HeadsetFail {
                serial: serial.clone(),
                error: format!("push config: {e}"),
            });
            let _ = tokio::fs::remove_file(&tmp_path).await;
            continue;
        }
        let _ = tokio::fs::remove_file(&tmp_path).await;

        if set_as_home {
            emit(PushEvent::HeadsetSetHome {
                serial: serial.clone(),
            });
            let _ = adb_shell(
                adb_path,
                serial,
                &[
                    "cmd",
                    "package",
                    "set-home-activity",
                    &format!("{}/.MainActivity", LAUNCHER_PACKAGE),
                ],
            )
            .await;
        }

        emit(PushEvent::HeadsetDone {
            serial: serial.clone(),
        });
    }
    Ok(())
}

/// Pull the headset's current launcher_config.json. Returns a default config if
/// the file doesn't exist yet (first-time push case).
pub async fn read_remote_config(adb_path: &Path, serial: &str) -> Result<LauncherConfig> {
    let tmp_path: PathBuf = std::env::temp_dir()
        .join(format!("midwestvr_launcher_pull_{}.json", serial.replace([':', '/'], "_")));
    // adb pull is best-effort; if the file is missing we return a default config
    // so the caller can write a fresh one.
    let _ = crate::adb::adb_pull(adb_path, serial, REMOTE_PATH, &tmp_path).await;
    if !tmp_path.exists() {
        return Ok(LauncherConfig::default());
    }
    let bytes = tokio::fs::read(&tmp_path).await.unwrap_or_default();
    let _ = tokio::fs::remove_file(&tmp_path).await;
    if bytes.is_empty() {
        return Ok(LauncherConfig::default());
    }
    serde_json::from_slice::<LauncherConfig>(&bytes)
        .map_err(|e| AppError::Config(format!("parse remote launcher_config.json: {e}")))
}

/// Write a fresh launcher_config.json onto the headset (overwriting any
/// previous file). Idempotent.
pub async fn write_remote_config(
    adb_path: &Path,
    serial: &str,
    cfg: &LauncherConfig,
) -> Result<()> {
    let _ = adb_shell(adb_path, serial, &["mkdir", "-p", REMOTE_DIR]).await;
    let tmp_path: PathBuf = std::env::temp_dir()
        .join(format!("midwestvr_launcher_write_{}.json", serial.replace([':', '/'], "_")));
    let json = serde_json::to_string_pretty(cfg)
        .map_err(|e| AppError::Config(format!("config serialize: {e}")))?;
    tokio::fs::write(&tmp_path, json).await?;
    let push_result = adb_push(adb_path, serial, &tmp_path, REMOTE_PATH).await;
    let _ = tokio::fs::remove_file(&tmp_path).await;
    push_result
}

/// Make our launcher the system home activity on the given headset.
pub async fn set_as_home_activity(adb_path: &Path, serial: &str) -> Result<()> {
    let _ = adb_shell(
        adb_path,
        serial,
        &[
            "cmd",
            "package",
            "set-home-activity",
            &format!("{}/.MainActivity", LAUNCHER_PACKAGE),
        ],
    )
    .await?;
    Ok(())
}

/// Returns true if our launcher APK is installed on the headset. Used by the
/// frontend to gate Class Mode behind a one-time install.
pub async fn is_installed(adb_path: &Path, serial: &str) -> Result<bool> {
    let out = adb_shell(
        adb_path,
        serial,
        &["pm", "list", "packages", LAUNCHER_PACKAGE],
    )
    .await?;
    let needle = format!("package:{}", LAUNCHER_PACKAGE);
    Ok(out.lines().any(|l| l.trim() == needle))
}
