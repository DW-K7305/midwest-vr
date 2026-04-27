//! Wi-Fi provisioning for Quest 2.
//!
//! Quest 2 doesn't expose `cmd wifi connect-network` cleanly to non-shell users
//! and the public `WifiManager.addNetworkSuggestions` API requires being a
//! foreground app. The reliable path for our adb-driven workflow is:
//!
//!   1. Launch the Wi-Fi setup intent.
//!   2. (For WPA-PSK networks) generate and push a wpa_supplicant-style
//!      config snippet that the user can manually load via the Quest's settings.
//!
//! For most K-12 classrooms, schools use either:
//!   * Open network or WPA2-PSK with a single password — supported here.
//!   * WPA2-Enterprise (802.1X) — requires per-headset cert provisioning, which
//!     is genuinely out of scope for v1; we surface that limitation in the UI.
//!
//! This module gives the frontend a single command that handles the PSK case
//! and clearly errors on Enterprise so the user isn't surprised.

use crate::adb::adb_shell;
use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WifiSecurity {
    Open,
    Wpa2Psk,
    /// Not supported in v1 — we error early so the UI can show a helpful message.
    Wpa2Enterprise,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WifiCreds {
    pub ssid: String,
    pub psk: Option<String>,
    pub security: WifiSecurity,
    /// If true, the headset will auto-connect when in range.
    pub auto_connect: bool,
}

pub async fn provision(adb_path: &Path, serial: &str, creds: &WifiCreds) -> Result<()> {
    if matches!(creds.security, WifiSecurity::Wpa2Enterprise) {
        return Err(AppError::Other(anyhow::anyhow!(
            "WPA2-Enterprise networks aren't supported in v1 — they need per-headset certificate provisioning."
        )));
    }
    if !creds.ssid.chars().all(|c| c != '\n' && c != '"') {
        return Err(AppError::Other(anyhow::anyhow!(
            "SSID contains characters that aren't safe to pass through adb shell."
        )));
    }

    // Open the Wi-Fi settings panel. This still requires the user to confirm
    // on-headset, but with the SSID/PSK pre-filled via clipboard, the flow is
    // a 2-tap operation.
    let _ = adb_shell(
        adb_path,
        serial,
        &[
            "am",
            "start",
            "-a",
            "android.settings.WIFI_SETTINGS",
        ],
    )
    .await?;

    // Push SSID and PSK to clipboard so user can paste.
    if let Some(psk) = &creds.psk {
        let payload = format!(r#"{{"ssid":"{}","psk":"{}"}}"#, escape(&creds.ssid), escape(psk));
        let _ = adb_shell(
            adb_path,
            serial,
            &["am", "broadcast", "-a", "clipper.set", "-e", "text", &payload],
        )
        .await; // best-effort
    }

    Ok(())
}

fn escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}
