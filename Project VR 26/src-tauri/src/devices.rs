//! Device discovery + vitals.
//!
//! `adb devices -l` gives us serial + state. We then issue a small batch of
//! `adb shell` queries for battery / storage / model / build to populate a Device
//! struct that the UI renders. Quest 2 reports as `model:Quest_2` (or sometimes
//! `Quest`) — we match on a list of known model strings.

use crate::adb::{adb, adb_shell};
use crate::error::Result;
use serde::Serialize;
use std::path::Path;

const QUEST_MODEL_HINTS: &[&str] = &["Quest_2", "Quest 2", "Quest", "Hollywood", "Eureka", "Vr_Monterey"];

#[derive(Debug, Clone, Serialize)]
pub struct Device {
    pub serial: String,
    /// "device" | "unauthorized" | "offline" | other adb-reported state.
    pub state: String,
    pub model: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub android_release: Option<String>,
    pub build_id: Option<String>,
    pub battery_pct: Option<u8>,
    pub battery_charging: Option<bool>,
    /// Bytes free / total on /sdcard (the user-data partition Quest exposes).
    pub storage_free: Option<u64>,
    pub storage_total: Option<u64>,
    /// Convenience flag: did we positively identify this as a Meta Quest?
    pub is_quest: bool,
}

impl Device {
    fn from_adb_devices_line(line: &str) -> Option<Self> {
        // Lines look like: "1WMHHA00X12345  device product:hollywood model:Quest_2 device:hollywood transport_id:3"
        let mut parts = line.split_whitespace();
        let serial = parts.next()?.to_string();
        let state = parts.next()?.to_string();
        if serial.is_empty() || state == "List" {
            return None;
        }
        let mut model = None;
        let mut product = None;
        for kv in parts {
            if let Some(v) = kv.strip_prefix("model:") {
                model = Some(v.to_string());
            } else if let Some(v) = kv.strip_prefix("product:") {
                product = Some(v.to_string());
            }
        }
        Some(Self {
            serial,
            state,
            model,
            manufacturer: None,
            product,
            android_release: None,
            build_id: None,
            battery_pct: None,
            battery_charging: None,
            storage_free: None,
            storage_total: None,
            is_quest: false,
        })
    }
}

/// Lightweight list (no per-device shells) — used for fast polling.
pub async fn list_basic(adb_path: &Path) -> Result<Vec<Device>> {
    let out = adb(adb_path, &["devices", "-l"]).await?;
    let mut devs: Vec<Device> = out
        .lines()
        .skip(1) // skip "List of devices attached"
        .filter(|l| !l.trim().is_empty())
        .filter_map(Device::from_adb_devices_line)
        .collect();
    for d in &mut devs {
        d.is_quest = is_quest_model(d.model.as_deref(), d.product.as_deref());
    }
    Ok(devs)
}

/// Heavy enrichment for a single device — battery, storage, build info.
pub async fn enrich(adb_path: &Path, dev: &mut Device) -> Result<()> {
    if dev.state != "device" {
        return Ok(()); // can't shell into offline/unauth devices
    }

    if let Ok(o) = adb_shell(adb_path, &dev.serial, &["getprop"]).await {
        for line in o.lines() {
            // Lines look like: [ro.product.model]: [Quest 2]
            if let Some((k, v)) = parse_getprop_line(line) {
                match k.as_str() {
                    "ro.product.model" => dev.model = Some(v),
                    "ro.product.manufacturer" => dev.manufacturer = Some(v),
                    "ro.product.name" => dev.product = Some(v),
                    "ro.build.version.release" => dev.android_release = Some(v),
                    "ro.build.id" => dev.build_id = Some(v),
                    _ => {}
                }
            }
        }
    }

    // Battery
    if let Ok(o) = adb_shell(adb_path, &dev.serial, &["dumpsys", "battery"]).await {
        for line in o.lines() {
            let line = line.trim();
            if let Some(v) = line.strip_prefix("level:") {
                dev.battery_pct = v.trim().parse().ok();
            } else if let Some(v) = line.strip_prefix("AC powered:") {
                if v.trim() == "true" {
                    dev.battery_charging = Some(true);
                }
            } else if let Some(v) = line.strip_prefix("USB powered:") {
                if v.trim() == "true" {
                    dev.battery_charging = Some(true);
                }
            } else if let Some(v) = line.strip_prefix("status:") {
                // status 2 = charging, 5 = full
                let s = v.trim();
                if s == "2" || s == "5" {
                    dev.battery_charging = Some(true);
                }
            }
        }
        if dev.battery_charging.is_none() {
            dev.battery_charging = Some(false);
        }
    }

    // Storage on /sdcard
    if let Ok(o) = adb_shell(adb_path, &dev.serial, &["df", "-B1", "/sdcard"]).await {
        // Header + one line. Columns: Filesystem 1B-blocks Used Available Use% Mounted-on
        for line in o.lines().skip(1) {
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() >= 4 {
                dev.storage_total = cols[1].parse().ok();
                dev.storage_free = cols[3].parse().ok();
                break;
            }
        }
    }

    dev.is_quest = is_quest_model(dev.model.as_deref(), dev.product.as_deref());
    Ok(())
}

fn parse_getprop_line(line: &str) -> Option<(String, String)> {
    // Format: [key]: [value]
    let line = line.trim();
    let key_end = line.find("]:")?;
    let key = line.get(1..key_end)?;
    // The value's opening '[' is the first '[' found after "]:".
    let v_open = line[key_end..].find('[')? + key_end + 1;
    let v_end = line.rfind(']')?;
    if v_open > v_end {
        return None;
    }
    Some((key.to_string(), line[v_open..v_end].to_string()))
}

fn is_quest_model(model: Option<&str>, product: Option<&str>) -> bool {
    let hay = format!(
        "{} {}",
        model.unwrap_or_default(),
        product.unwrap_or_default()
    );
    QUEST_MODEL_HINTS
        .iter()
        .any(|h| hay.to_ascii_lowercase().contains(&h.to_ascii_lowercase()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_devices_line() {
        let l = "1WMHHA00X12345  device product:hollywood model:Quest_2 device:hollywood transport_id:3";
        let d = Device::from_adb_devices_line(l).unwrap();
        assert_eq!(d.serial, "1WMHHA00X12345");
        assert_eq!(d.state, "device");
        assert_eq!(d.model.as_deref(), Some("Quest_2"));
    }

    #[test]
    fn parses_getprop() {
        let (k, v) = parse_getprop_line("[ro.product.model]: [Quest 2]").unwrap();
        assert_eq!(k, "ro.product.model");
        assert_eq!(v, "Quest 2");
    }

    #[test]
    fn detects_quest() {
        assert!(is_quest_model(Some("Quest 2"), None));
        assert!(is_quest_model(Some("Quest_2"), Some("hollywood")));
        assert!(!is_quest_model(Some("Pixel 7"), None));
    }
}
