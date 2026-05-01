//! Enrollment Profiles — the one-click setup primitive.
//!
//! A Profile is a saved bundle of headset settings, apps, and launcher
//! configuration that can be applied to any connected headset in one click.
//! Think of it as ManageXR's "deployment" concept, scoped down for K-12 IT
//! who manages 9–10 Quest 2s out of a closet.
//!
//! ## Why this exists
//!
//! Before Profiles, setting up a fresh headset was an N-step manual process:
//! plug in, push wifi, install 6 apps, remove some bloatware, push the
//! launcher, pick a kiosk app. The teacher had to remember the order, click
//! through 5 screens, and do it again per headset. Profiles collapse all of
//! that into pick-profile → click "Apply".
//!
//! ## Apply order
//!
//! When `apply()` runs, it executes these steps in this exact order, emitting
//! a `ProfileApplyEvent` after each so the UI can show step-by-step progress.
//! Every step is best-effort: a failure on step N does NOT abort the rest, it
//! just marks that step `fail` and continues. Net result: a partially-applied
//! profile leaves the headset MORE configured, not LESS.
//!
//!   1. Rename — set the headset's display name from the profile's
//!      `headset_name` (or the configured username + tail-of-serial if blank).
//!   2. Wi-Fi — push the profile's Wi-Fi creds (only if the profile has them).
//!   3. Install apps — catalog-driven sideload of every app in `install_apps`.
//!   4. Remove apps — uninstall every package in `remove_packages`.
//!   5. Launcher push — push our launcher APK (if `launcher_apk_path` set)
//!      AND write its config (school name + greeting + allowlist + kiosk).
//!   6. Kiosk lock — if `kiosk_app` is set, lock the headset to it.
//!
//! ## Username field
//!
//! Each profile carries a `username` — a short identifier that becomes part
//! of the headset's display name (e.g. "Mrs-Smith Library #3"). This is
//! intentionally local-only; it is NEVER sent to Meta or any external
//! service. It just goes into `settings put global device_name`.

use crate::adb::adb_shell;
use crate::apps;
use crate::catalog::{Catalog, CatalogStore};
use crate::discover;
use crate::error::Result;
use crate::kiosk;
use crate::launcher::{self, LauncherConfig};
use crate::wifi::WifiCreds;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    /// Stable identifier — slug-style, e.g. "library-stations" or "mrs-smith-5th".
    pub id: String,
    /// Human-readable name. Shown everywhere in the UI.
    pub name: String,
    /// Optional longer description so the teacher remembers what this is for.
    #[serde(default)]
    pub description: String,
    /// The local "user" of this profile — purely informational, never leaves
    /// the Mac. Combined with the headset's last-4 serial to produce a
    /// distinctive display name like "Mrs-Smith #2145".
    #[serde(default)]
    pub username: String,
    /// If non-empty, the headset will be renamed to exactly this. Otherwise
    /// the apply step builds a name from `username` + tail-of-serial.
    #[serde(default)]
    pub headset_name: String,
    /// Optional Wi-Fi credentials to push during apply.
    #[serde(default)]
    pub wifi: Option<WifiCreds>,
    /// Catalog app IDs to install. Looked up against the catalog store at
    /// apply-time so the user picks from friendly thumbnails, not URLs.
    #[serde(default)]
    pub install_apps: Vec<String>,
    /// Package names to uninstall. Used to strip Meta bloatware ("First
    /// Steps", "Oculus TV", etc.) from a fresh headset.
    #[serde(default)]
    pub remove_packages: Vec<String>,
    /// If set, lock the headset to this package after apply (Class Mode lock).
    #[serde(default)]
    pub kiosk_app: Option<String>,
    /// Embedded launcher config — school name, greeting, allowlist. Fully
    /// optional: when None we don't touch the launcher.
    #[serde(default)]
    pub launcher: Option<LauncherConfig>,
    /// Local path to launcher APK to push. None = don't push (assume already
    /// installed, just write config).
    #[serde(default)]
    pub launcher_apk_path: Option<String>,
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            description: String::new(),
            username: String::new(),
            headset_name: String::new(),
            wifi: None,
            install_apps: Vec::new(),
            remove_packages: Vec::new(),
            kiosk_app: None,
            launcher: None,
            launcher_apk_path: None,
        }
    }
}

/// One event per step. The frontend listens on `profile_apply_event` and
/// renders a live progress checklist as these arrive.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProfileApplyEvent {
    Start { serial: String, profile_id: String },
    Step { serial: String, step: String, status: StepStatus, message: String },
    Done { serial: String, ok_steps: usize, fail_steps: usize },
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StepStatus {
    Running,
    Ok,
    Skipped,
    Fail,
}

/// Apply a profile to a single headset. See module docs for step order.
pub async fn apply<F>(
    adb_path: &Path,
    serial: &str,
    profile: &Profile,
    catalog: &CatalogStore,
    mut emit: F,
) -> Result<(usize, usize)>
where
    F: FnMut(ProfileApplyEvent),
{
    emit(ProfileApplyEvent::Start {
        serial: serial.to_string(),
        profile_id: profile.id.clone(),
    });

    let mut ok_steps = 0usize;
    let mut fail_steps = 0usize;

    // Helper to record a step result and emit the event. Closures + async
    // don't compose cleanly so we inline.
    macro_rules! step {
        ($name:expr, $body:block) => {{
            let step_name: &str = $name;
            emit(ProfileApplyEvent::Step {
                serial: serial.to_string(),
                step: step_name.to_string(),
                status: StepStatus::Running,
                message: String::new(),
            });
            let res: std::result::Result<String, String> = $body;
            match res {
                Ok(msg) => {
                    ok_steps += 1;
                    emit(ProfileApplyEvent::Step {
                        serial: serial.to_string(),
                        step: step_name.to_string(),
                        status: StepStatus::Ok,
                        message: msg,
                    });
                }
                Err(e) if e == "__skipped__" => {
                    // Step was a no-op for this profile — don't count as fail.
                    emit(ProfileApplyEvent::Step {
                        serial: serial.to_string(),
                        step: step_name.to_string(),
                        status: StepStatus::Skipped,
                        message: "Not configured for this profile".to_string(),
                    });
                }
                Err(e) => {
                    fail_steps += 1;
                    emit(ProfileApplyEvent::Step {
                        serial: serial.to_string(),
                        step: step_name.to_string(),
                        status: StepStatus::Fail,
                        message: e,
                    });
                }
            }
        }};
    }

    // 1. Rename
    step!("rename", {
        let final_name: Option<String> = if !profile.headset_name.is_empty() {
            Some(profile.headset_name.clone())
        } else if !profile.username.is_empty() {
            let tail: String = serial
                .chars()
                .rev()
                .take(4)
                .collect::<String>()
                .chars()
                .rev()
                .collect();
            Some(format!("{} {}", profile.username, tail))
        } else {
            None
        };
        match final_name {
            None => Err("__skipped__".to_string()),
            Some(name) => match crate::setup::rename(adb_path, serial, &name).await {
                Ok(_) => Ok(format!("Renamed to '{}'", name)),
                Err(e) => Err(e.to_string()),
            },
        }
    });

    // 2. Wi-Fi
    step!("wifi", {
        match &profile.wifi {
            None => Err("__skipped__".to_string()),
            Some(creds) => match crate::wifi::provision(adb_path, serial, creds).await {
                Ok(_) => Ok(format!("Pushed SSID '{}'", creds.ssid)),
                Err(e) => Err(e.to_string()),
            },
        }
    });

    // 3. Install apps from the catalog
    step!("install_apps", {
        if profile.install_apps.is_empty() {
            Err("__skipped__".to_string())
        } else {
            match catalog.snapshot() {
                None => Err("Catalog not loaded — refresh it from Browse Catalog first.".into()),
                Some(cat) => {
                    let cat: Catalog = cat;
                    let mut succeeded = 0usize;
                    let mut failed: Vec<String> = Vec::new();
                    for app_id in &profile.install_apps {
                        let entry = cat.apps.iter().find(|a| &a.id == app_id).cloned();
                        match entry {
                            None => failed.push(format!("{} (not in catalog)", app_id)),
                            Some(entry) => {
                                let serials = vec![serial.to_string()];
                                let ok = discover::install_to_many(
                                    adb_path,
                                    &entry,
                                    &serials,
                                    |_| {},
                                )
                                .await;
                                match ok {
                                    Ok(_) => succeeded += 1,
                                    Err(e) => failed.push(format!("{}: {}", entry.name, e)),
                                }
                            }
                        }
                    }
                    if failed.is_empty() {
                        Ok(format!("Installed {} app(s)", succeeded))
                    } else {
                        Err(format!(
                            "{} ok, {} failed: {}",
                            succeeded,
                            failed.len(),
                            failed.join("; ")
                        ))
                    }
                }
            }
        }
    });

    // 4. Remove apps
    step!("remove_apps", {
        if profile.remove_packages.is_empty() {
            Err("__skipped__".to_string())
        } else {
            let mut succeeded = 0usize;
            let mut already_gone = 0usize;
            for pkg in &profile.remove_packages {
                match apps::uninstall(adb_path, serial, pkg).await {
                    Ok(_) => succeeded += 1,
                    Err(_) => already_gone += 1, // most "failures" = "not installed"
                }
            }
            Ok(format!(
                "Removed {} ({} already gone)",
                succeeded, already_gone
            ))
        }
    });

    // 5. Launcher push (APK + config)
    step!("launcher", {
        match &profile.launcher {
            None => Err("__skipped__".to_string()),
            Some(cfg) => {
                let cfg = cfg.clone();
                match &profile.launcher_apk_path {
                    Some(apk_path) => {
                        let apk = std::path::PathBuf::from(apk_path);
                        if !apk.exists() {
                            Err(format!("Launcher APK not found at {}", apk_path))
                        } else {
                            match launcher::push_one(adb_path, serial, &apk, &cfg, true).await {
                                Ok(_) => Ok("Pushed APK + config + set as home".to_string()),
                                Err(e) => Err(e.to_string()),
                            }
                        }
                    }
                    None => {
                        // Just write the config. If launcher isn't installed,
                        // this stages config for whenever it does get installed.
                        match launcher::write_remote_config(adb_path, serial, &cfg).await {
                            Ok(_) => Ok("Updated launcher config".to_string()),
                            Err(e) => Err(e.to_string()),
                        }
                    }
                }
            }
        }
    });

    // 6. Kiosk lock
    step!("kiosk", {
        match &profile.kiosk_app {
            None => Err("__skipped__".to_string()),
            Some(pkg) => match kiosk::set_kiosk(adb_path, serial, pkg).await {
                Ok(_) => Ok(format!("Locked to {}", pkg)),
                Err(e) => Err(e.to_string()),
            },
        }
    });

    emit(ProfileApplyEvent::Done {
        serial: serial.to_string(),
        ok_steps,
        fail_steps,
    });
    Ok((ok_steps, fail_steps))
}

/// Detect whether a freshly-plugged headset has Developer Mode enabled.
/// Heuristic: if `adb shell getprop ro.product.model` succeeds, the headset
/// authorized us — which is only possible with Developer Mode on.
pub async fn dev_mode_check(adb_path: &Path, serial: &str) -> Result<bool> {
    match adb_shell(adb_path, serial, &["getprop", "ro.product.model"]).await {
        Ok(out) => Ok(!out.trim().is_empty()),
        Err(_) => Ok(false),
    }
}

/// Attempt to fetch what the headset currently calls itself, so we can
/// surface "renamed from X to Y" in the apply log.
pub async fn current_device_name(adb_path: &Path, serial: &str) -> Result<String> {
    if let Ok(o) = adb_shell(adb_path, serial, &["settings", "get", "global", "device_name"]).await {
        let s = o.trim();
        if !s.is_empty() && s != "null" {
            return Ok(s.to_string());
        }
    }
    Ok(String::new())
}

/// Generate a slug from a name. Used when creating new profiles client-side.
pub fn slugify(name: &str) -> String {
    let mut out = String::new();
    let mut last_dash = false;
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash && !out.is_empty() {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_end_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn slugify_basic() {
        assert_eq!(slugify("Library Stations"), "library-stations");
        assert_eq!(slugify("Mrs. Smith's 5th Grade!"), "mrs-smith-s-5th-grade");
        assert_eq!(slugify("   leading   "), "leading");
    }
}
