//! Push the MidWest-VR Launcher APK + a launcher_config.json onto a fleet of
//! headsets in one shot. Optional set-as-home call (requires user confirmation
//! on the headset).

use crate::adb::{adb_push, adb_shell};
use crate::apps;
use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Schema written to /sdcard/Android/data/com.midwestvr.launcher/files/launcher_config.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LauncherConfig {
    #[serde(default)]
    pub school_name: String,
    #[serde(default)]
    pub greeting: String,
    #[serde(default)]
    pub include_system: bool,
    #[serde(default)]
    pub allowlist: Vec<String>,
}

const REMOTE_DIR: &str = "/sdcard/Android/data/com.midwestvr.launcher/files";
const REMOTE_PATH: &str = "/sdcard/Android/data/com.midwestvr.launcher/files/launcher_config.json";
const LAUNCHER_PACKAGE: &str = "com.midwestvr.launcher";

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

