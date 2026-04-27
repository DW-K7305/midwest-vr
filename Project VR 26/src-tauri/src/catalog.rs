//! K-12 catalog of curated Quest 2 apps. Fetched from the GitHub-hosted JSON
//! and cached in memory + on disk.

use crate::error::{AppError, Result};
use crate::network;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::RwLock;

/// Default catalog URL (overridable in settings, but only to other allowlisted hosts).
pub const DEFAULT_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/DW-K7305/midwest-vr/main/Project%20VR%2026/catalog/catalog.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum InstallSource {
    /// We can sideload this directly: download the APK, verify hash, push to headset.
    Sideload,
    /// Listed for visibility only — user must get it through Meta's Quest store
    /// (the in-headset store), not us.
    Store,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogApp {
    pub id: String,
    pub name: String,
    pub publisher: String,
    pub short_desc: String,
    pub long_desc: String,
    pub subjects: Vec<String>,
    pub grade_bands: Vec<String>,
    pub age_rating: String, // E / E10+ / T / M
    pub license: String,    // Free / Free with account / Paid / Open-source
    pub source: InstallSource,
    pub source_url: String,                 // publisher / store URL for context
    pub apk_url: Option<String>,            // direct .apk URL (Sideload only)
    pub apk_sha256: Option<String>,         // expected SHA256 (Sideload only)
    pub apk_size_bytes: Option<u64>,        // for progress UI
    pub package: Option<String>,            // android package name (used by kiosk + launch)
    pub thumbnail_url: Option<String>,      // hero image
    pub screenshots: Vec<String>,           // additional screenshots
    pub recommended: bool,                  // included in "Install Recommended Pack on All"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Catalog {
    pub schema_version: u32,
    pub last_updated: String,
    pub apps: Vec<CatalogApp>,
}

impl Default for Catalog {
    fn default() -> Self {
        Self {
            schema_version: 1,
            last_updated: "1970-01-01".into(),
            apps: vec![],
        }
    }
}

pub struct CatalogStore {
    cache_path: PathBuf,
    inner: RwLock<Option<Catalog>>,
}

impl CatalogStore {
    pub fn new(cache_dir: PathBuf) -> Self {
        let cache_path = cache_dir.join("catalog.cache.json");
        // Try loading any previously cached catalog so the UI can render offline.
        let initial = std::fs::read_to_string(&cache_path)
            .ok()
            .and_then(|s| serde_json::from_str::<Catalog>(&s).ok());
        Self {
            cache_path,
            inner: RwLock::new(initial),
        }
    }

    pub fn snapshot(&self) -> Option<Catalog> {
        self.inner.read().expect("catalog poisoned").clone()
    }

    /// Force-refresh the catalog from the network (allowlisted host only).
    pub async fn refresh(&self, url: &str) -> Result<Catalog> {
        let fresh: Catalog = network::get_json(url, "catalog refresh").await?;
        if fresh.schema_version != 1 {
            return Err(AppError::Parse(format!(
                "unsupported catalog schema_version {}",
                fresh.schema_version
            )));
        }
        // Persist to disk for offline rendering on next launch.
        if let Some(parent) = self.cache_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&fresh) {
            let _ = std::fs::write(&self.cache_path, json);
        }
        *self.inner.write().expect("catalog poisoned") = Some(fresh.clone());
        Ok(fresh)
    }
}
