//! Phase 29 — Headset Setup Wizard. Replicates ~80% of what the Meta phone app
//! does, via USB. Things Meta blocks (account login/link) are NOT here.

use crate::adb::{adb, adb_shell};
use crate::error::Result;
use std::path::{Path, PathBuf};

/// Set the headset's display device name (Settings → About).
pub async fn rename(adb_path: &Path, serial: &str, name: &str) -> Result<()> {
    // Sanitize: refuse newlines / shell metacharacters.
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_graphic() || *c == ' ')
        .take(64)
        .collect();
    let _ = adb_shell(
        adb_path,
        serial,
        &["settings", "put", "global", "device_name", &safe],
    )
    .await?;
    Ok(())
}

pub async fn reboot(adb_path: &Path, serial: &str) -> Result<()> {
    let _ = adb(adb_path, &["-s", serial, "reboot"]).await?;
    Ok(())
}

pub async fn power_off(adb_path: &Path, serial: &str) -> Result<()> {
    let _ = adb_shell(adb_path, serial, &["reboot", "-p"]).await?;
    Ok(())
}

/// Factory reset is destructive. Caller is expected to require an explicit
/// user confirmation BEFORE calling this.
pub async fn factory_reset(adb_path: &Path, serial: &str) -> Result<()> {
    let _ = adb_shell(
        adb_path,
        serial,
        &[
            "am",
            "broadcast",
            "-a",
            "android.intent.action.MASTER_CLEAR",
            "-p",
            "android",
        ],
    )
    .await?;
    Ok(())
}

/// Sync the headset's clock to "right now" on this Mac. Useful when a fleet
/// has been off the network for a while.
pub async fn sync_time(adb_path: &Path, serial: &str) -> Result<()> {
    // adb shell `date` accepts MMDDhhmm[[CC]YY][.ss]
    let now = chrono_like_now();
    let _ = adb_shell(adb_path, serial, &["date", &now]).await?;
    Ok(())
}

/// Take a screenshot of what's currently on the headset display, saving to a
/// PNG on this Mac. Returns the local path. Useful for documentation / proof
/// of state without putting the headset on.
pub async fn screenshot(adb_path: &Path, serial: &str, dest_dir: &Path) -> Result<PathBuf> {
    std::fs::create_dir_all(dest_dir)?;
    let stamp = chrono_like_now();
    let local: PathBuf = dest_dir.join(format!("screenshot-{}-{}.png", serial, stamp));
    // adb exec-out screencap -p > local.png streams the PNG bytes back.
    use tokio::io::AsyncWriteExt;
    let mut child = tokio::process::Command::new(adb_path)
        .args(["-s", serial, "exec-out", "screencap", "-p"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()?;
    let mut stdout = child.stdout.take().ok_or_else(|| crate::error::AppError::Other(
        anyhow::anyhow!("adb exec-out: no stdout"),
    ))?;
    let mut file = tokio::fs::File::create(&local).await?;
    let mut buf = vec![0u8; 32 * 1024];
    use tokio::io::AsyncReadExt;
    loop {
        let n = stdout.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).await?;
    }
    file.flush().await?;
    let status = child.wait().await?;
    if !status.success() {
        return Err(crate::error::AppError::AdbFailed {
            code: status.code(),
            stderr: "screencap failed".into(),
        });
    }
    Ok(local)
}

/// Format a timestamp suitable for `adb shell date <stamp>` (MMDDhhmmCCYY.ss).
fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0) as i64;
    // Convert to UTC components manually; pulling chrono in just for this is overkill.
    let (year, month, day, hour, minute, second) = unix_to_components(secs);
    format!(
        "{:02}{:02}{:02}{:02}{:04}.{:02}",
        month, day, hour, minute, year, second
    )
}

fn unix_to_components(t: i64) -> (i32, u32, u32, u32, u32, u32) {
    // Compute UTC date/time without external crates. Algorithm from H. Rata, "Calendrical Calculations".
    const SECS_PER_DAY: i64 = 86_400;
    let days = t.div_euclid(SECS_PER_DAY);
    let secs_of_day = t.rem_euclid(SECS_PER_DAY) as u32;
    let hour = secs_of_day / 3600;
    let minute = (secs_of_day % 3600) / 60;
    let second = secs_of_day % 60;

    // Days since 1970-01-01 → Y/M/D.
    // Algorithm: Howard Hinnant's days_from_civil inverse.
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097) as i64; // day-of-era [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // [0, 365]
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m: u32 = if mp < 10 { (mp + 3) as u32 } else { (mp - 9) as u32 };
    let y_final = if m <= 2 { y + 1 } else { y };
    (y_final as i32, m, d, hour, minute, second)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn epoch_zero() {
        let (y, m, d, h, mi, s) = unix_to_components(0);
        assert_eq!((y, m, d, h, mi, s), (1970, 1, 1, 0, 0, 0));
    }
}
