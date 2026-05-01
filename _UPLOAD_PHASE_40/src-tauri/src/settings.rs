//! Portable-mode aware settings persistence.
//!
//! When the app's executable lives under `/Volumes/<anything>/...` we treat
//! that as portable mode and write `MidWest-VR.config.json` next to the bundle
//! (so plugging the SSD into another Mac brings the config along).
//!
//! When it lives anywhere else (e.g. `/Applications`), we use the standard
//! `dirs::config_dir() / MidWest-VR / config.json`.
//!
//! The user can override either choice via the Settings UI.

use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub poll_interval_ms: u64,
    pub auto_select_first_device: bool,
    pub theme: Theme,
    /// If set, overrides the auto-detected portable/system mode.
    pub config_dir_override: Option<PathBuf>,
    /// Master switch for the online catalog (Discover tab). Default OFF.
    /// When OFF the app makes zero outbound network requests.
    #[serde(default)]
    pub online_catalog_enabled: bool,
    /// Catalog index URL. Must point at an allowlisted host.
    #[serde(default = "default_catalog_url")]
    pub catalog_url: String,
    /// Headsets we've paired wirelessly. Auto-reconnected on launch.
    #[serde(default)]
    pub paired_wireless: Vec<PairedHeadset>,
    /// Saved enrollment profiles. Each is a 1-click bundle of headset
    /// settings + apps + kiosk + launcher config that can be applied to any
    /// connected headset. See `profile.rs` for the schema.
    #[serde(default)]
    pub profiles: Vec<crate::profile::Profile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PairedHeadset {
    pub label: String,    // friendly name (the headset model + serial tail when we paired)
    pub serial: String,   // original USB serial — used to remember which headset this was
    pub ip: String,       // wlan0 IP at pair-time; we'll try this first
}

fn default_catalog_url() -> String {
    crate::catalog::DEFAULT_CATALOG_URL.to_string()
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Theme {
    Dark,
    Light,
    System,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            poll_interval_ms: 4000,
            auto_select_first_device: true,
            theme: Theme::Dark,
            config_dir_override: None,
            online_catalog_enabled: false,
            catalog_url: default_catalog_url(),
            paired_wireless: Vec::new(),
            profiles: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct StorageInfo {
    pub portable: bool,
    pub config_path: PathBuf,
    pub volume_root: Option<PathBuf>,
}

pub struct SettingsStore {
    inner: RwLock<AppSettings>,
    info: StorageInfo,
}

impl SettingsStore {
    pub fn load() -> Result<Self> {
        let info = detect_storage()?;
        let inner = if info.config_path.exists() {
            let raw = fs::read_to_string(&info.config_path)?;
            serde_json::from_str(&raw).unwrap_or_default()
        } else {
            let s = AppSettings::default();
            persist(&info.config_path, &s)?;
            s
        };
        Ok(Self {
            inner: RwLock::new(inner),
            info,
        })
    }

    pub fn snapshot(&self) -> AppSettings {
        self.inner.read().expect("settings poisoned").clone()
    }

    pub fn info(&self) -> StorageInfo {
        self.info.clone()
    }

    pub fn update(&self, new: AppSettings) -> Result<AppSettings> {
        {
            let mut w = self.inner.write().expect("settings poisoned");
            *w = new.clone();
        }
        persist(&self.info.config_path, &new)?;
        Ok(new)
    }
}

fn detect_storage() -> Result<StorageInfo> {
    let exe = std::env::current_exe()?;
    let portable = is_under_volumes(&exe);
    if portable {
        // Place config two levels up from the binary: <App>.app/Contents/MacOS/<bin>
        // → put the config next to <App>.app on the volume.
        let mut p = exe.clone();
        for _ in 0..3 {
            p.pop();
        }
        let cfg = p.join("MidWest-VR.config.json");
        let volume = volume_root(&exe);
        return Ok(StorageInfo {
            portable: true,
            config_path: cfg,
            volume_root: volume,
        });
    }
    let base = dirs::config_dir()
        .ok_or_else(|| AppError::Config("dirs::config_dir() returned None".into()))?
        .join("MidWest-VR");
    fs::create_dir_all(&base)?;
    Ok(StorageInfo {
        portable: false,
        config_path: base.join("config.json"),
        volume_root: None,
    })
}

fn is_under_volumes(p: &Path) -> bool {
    p.components()
        .any(|c| c.as_os_str().to_string_lossy() == "Volumes")
        && p.starts_with("/Volumes")
}

fn volume_root(p: &Path) -> Option<PathBuf> {
    // /Volumes/<NAME>/...
    let mut iter = p.components();
    let _ = iter.next(); // root
    let _ = iter.next(); // "Volumes"
    let name = iter.next()?;
    Some(PathBuf::from("/Volumes").join(name.as_os_str()))
}

fn persist(path: &Path, s: &AppSettings) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let txt = serde_json::to_string_pretty(s).map_err(|e| AppError::Config(e.to_string()))?;
    fs::write(path, txt)?;
    Ok(())
}
