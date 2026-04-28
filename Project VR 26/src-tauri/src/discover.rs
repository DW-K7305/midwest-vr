//! Orchestrates: download an APK from a catalog entry, verify SHA256, then
//! sideload to one or more headsets in parallel.

use crate::apps;
use crate::catalog::{CatalogApp, InstallSource};
use crate::error::{AppError, Result};
use crate::network;
use std::path::{Path, PathBuf};

/// Cache directory for downloaded APKs (kept in OS temp so we don't pile onto the SSD).
fn apk_cache_dir() -> PathBuf {
    std::env::temp_dir().join("midwest-vr-apk-cache")
}

/// Download (or reuse cached) APK for the given catalog entry.
/// Returns the local path to the verified APK.
pub async fn download_app<F>(app: &CatalogApp, mut on_progress: F) -> Result<PathBuf>
where
    F: FnMut(u64, u64),
{
    if !matches!(app.source, InstallSource::Sideload) {
        return Err(AppError::Other(anyhow::anyhow!(
            "{} is a Store-only entry — get it from the Quest Store on the headset",
            app.name
        )));
    }
    let url = app
        .apk_url
        .as_deref()
        .ok_or_else(|| AppError::Other(anyhow::anyhow!("no apk_url in catalog entry {}", app.id)))?;

    let cache = apk_cache_dir();
    std::fs::create_dir_all(&cache)?;
    let dest = cache.join(format!("{}.apk", app.id));

    // If we already have a cached copy with the right hash, skip the download.
    if let (true, Some(expected)) = (dest.exists(), app.apk_sha256.as_deref()) {
        if let Ok(bytes) = std::fs::read(&dest) {
            use sha2::{Digest, Sha256};
            let mut h = Sha256::new();
            h.update(&bytes);
            let actual = hex::encode(h.finalize());
            if actual.eq_ignore_ascii_case(expected) {
                tracing::info!("apk cache hit for {}", app.id);
                on_progress(bytes.len() as u64, bytes.len() as u64);
                return Ok(dest);
            }
        }
    }

    network::download_to_file(
        url,
        &dest,
        app.apk_sha256.as_deref(),
        &format!("apk download: {}", app.id),
        |d, t| on_progress(d, t),
    )
    .await?;
    Ok(dest)
}

/// Install an already-downloaded APK onto a single headset.
pub async fn install_to_headset<F>(
    adb_path: &Path,
    serial: &str,
    apk: &Path,
    on_line: F,
) -> Result<()>
where
    F: FnMut(&str),
{
    apps::install(adb_path, serial, apk, on_line).await
}

/// Combined: download then install to a list of serials, sequentially per
/// headset (parallel installs on Quest 2 over USB are flaky).
pub async fn install_to_many<E>(
    adb_path: &Path,
    app: &CatalogApp,
    serials: &[String],
    mut emit: E,
) -> Result<()>
where
    E: FnMut(BatchEvent),
{
    emit(BatchEvent::DownloadStart {
        app_id: app.id.clone(),
    });
    let apk = download_app(app, |downloaded, total| {
        emit_progress(&mut emit, &app.id, downloaded, total);
    })
    .await?;
    emit(BatchEvent::DownloadDone {
        app_id: app.id.clone(),
    });

    for serial in serials {
        emit(BatchEvent::HeadsetStart {
            app_id: app.id.clone(),
            serial: serial.clone(),
        });
        let result = install_to_headset(adb_path, serial, &apk, |line| {
            emit(BatchEvent::HeadsetLine {
                app_id: app.id.clone(),
                serial: serial.clone(),
                line: line.to_string(),
            });
        })
        .await;
        match result {
            Ok(_) => emit(BatchEvent::HeadsetDone {
                app_id: app.id.clone(),
                serial: serial.clone(),
            }),
            Err(e) => emit(BatchEvent::HeadsetFail {
                app_id: app.id.clone(),
                serial: serial.clone(),
                error: e.to_string(),
            }),
        }
    }
    Ok(())
}

fn emit_progress<E: FnMut(BatchEvent)>(emit: &mut E, app_id: &str, downloaded: u64, total: u64) {
    emit(BatchEvent::DownloadProgress {
        app_id: app_id.to_string(),
        downloaded,
        total,
    });
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum BatchEvent {
    DownloadStart { app_id: String },
    DownloadProgress { app_id: String, downloaded: u64, total: u64 },
    DownloadDone { app_id: String },
    HeadsetStart { app_id: String, serial: String },
    HeadsetLine { app_id: String, serial: String, line: String },
    HeadsetDone { app_id: String, serial: String },
    HeadsetFail { app_id: String, serial: String, error: String },
}

/// Used by the "Recommended Pack" one-click button: returns the catalog apps
/// flagged `recommended: true` AND of source `Sideload` (since Store entries
/// can't be auto-installed).
pub fn recommended_sideload_apps(catalog: &crate::catalog::Catalog) -> Vec<CatalogApp> {
    catalog
        .apps
        .iter()
        .filter(|a| a.recommended && matches!(a.source, InstallSource::Sideload))
        .cloned()
        .collect()
}
