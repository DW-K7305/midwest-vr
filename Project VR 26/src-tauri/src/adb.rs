//! Thin wrapper around the bundled `adb` binary.
//!
//! Why subprocess instead of a Rust ADB crate?
//!   * `adb shell` parsing on Quest 2 needs the real adb to handle PTY-ish quirks.
//!   * `adb install` streams large APKs reliably.
//!   * The binary is ~2 MB and ships in `Contents/Resources/adb-tools/adb` — the app
//!     stays self-contained and PATH-independent on the user's machine.
//!
//! All public functions accept the resolved adb path so callers don't pay the
//! resource-resolution cost on every shot.

use crate::error::{AppError, Result};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

/// Resolves the path to the bundled `adb` executable inside the app bundle.
/// On macOS that's `Foo.app/Contents/Resources/adb-tools/adb`. During `tauri dev`
/// it resolves to `src-tauri/resources/adb-tools/adb`.
pub fn resolve_adb_path(app: &AppHandle) -> Result<PathBuf> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| AppError::Config(format!("resource_dir: {e}")))?;
    let candidate = resource_dir.join("adb-tools").join("adb");
    if candidate.exists() {
        Ok(candidate)
    } else {
        Err(AppError::AdbMissing(candidate.display().to_string()))
    }
}

/// Run `adb <args>` to completion and capture stdout. Errors include stderr.
pub async fn adb(adb_path: &Path, args: &[&str]) -> Result<String> {
    tracing::debug!(?args, "adb");
    let out = Command::new(adb_path)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .await?;
    if !out.status.success() {
        return Err(AppError::AdbFailed {
            code: out.status.code(),
            stderr: String::from_utf8_lossy(&out.stderr).trim().to_string(),
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Run an `adb -s <serial> shell <cmd>` and return stdout.
pub async fn adb_shell(adb_path: &Path, serial: &str, cmd: &[&str]) -> Result<String> {
    let mut full: Vec<&str> = vec!["-s", serial, "shell"];
    full.extend_from_slice(cmd);
    adb(adb_path, &full).await
}

/// Streamed install for large APKs — sends per-line progress events through a
/// callback so the UI can render a progress bar.
pub async fn adb_install_streaming<F>(
    adb_path: &Path,
    serial: &str,
    apk: &Path,
    mut on_line: F,
) -> Result<()>
where
    F: FnMut(&str),
{
    let mut child = Command::new(adb_path)
        .args(["-s", serial, "install", "-r", "-g"])
        .arg(apk)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    if let Some(stdout) = child.stdout.take() {
        let mut lines = BufReader::new(stdout).lines();
        while let Some(line) = lines.next_line().await? {
            on_line(&line);
        }
    }
    let status = child.wait().await?;
    if !status.success() {
        return Err(AppError::AdbFailed {
            code: status.code(),
            stderr: "install failed".into(),
        });
    }
    Ok(())
}

/// Best-effort `adb start-server` — silences the first-run welcome banner.
pub async fn ensure_server(adb_path: &Path) -> Result<()> {
    let _ = adb(adb_path, &["start-server"]).await?;
    Ok(())
}
