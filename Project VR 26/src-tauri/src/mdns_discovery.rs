//! mDNS / Bonjour-based discovery of Quest 2 headsets on the local network.
//!
//! ## Why this exists
//!
//! Pre-Phase 42, our wireless reconnect was IP-based: we saved the headset's
//! IP at pair-time and tried to reach it later. That works fine at one
//! location, but breaks the moment the user (a roving K-12 IT person)
//! transports the fleet to a different building with a different DHCP range.
//! The saved IP belongs to a network that's not even connected anymore.
//!
//! ## How mDNS solves it
//!
//! Quest 2 (Android 11+) advertises its ADB-over-Wi-Fi service via mDNS as
//! `_adb-tls-connect._tcp.local.`. By browsing that service type on the
//! current Wi-Fi, we find every Quest on this network regardless of what
//! DHCP gave it today. We then verify each candidate by connecting and
//! reading its serial via `adb shell getprop ro.serialno`, matching against
//! the user's saved pairings. Net effect: pair once over USB ever, then
//! the headset stays findable on any network the user wanders onto, with
//! zero configuration.
//!
//! ## Falls back gracefully
//!
//! If mDNS is unavailable (network blocks multicast, headset doesn't
//! advertise, etc.), discovery returns an empty Vec rather than erroring.
//! The IP-based path remains the primary; mDNS is a fallback that activates
//! when the saved IP doesn't respond.

use crate::adb::{adb, adb_shell};
use crate::error::Result;
use mdns_sd::{ServiceDaemon, ServiceEvent};
use serde::Serialize;
use std::path::Path;
use std::time::{Duration, Instant};

/// Service type Quest 2 / Android 11+ uses to advertise wireless ADB.
const ADB_SERVICE: &str = "_adb-tls-connect._tcp.local.";
/// Older Android (pre-11) used this; included as a courtesy belt-and-suspenders
/// — costs nothing to also browse for it.
const ADB_LEGACY_SERVICE: &str = "_adb._tcp.local.";

#[derive(Debug, Clone, Serialize)]
pub struct DiscoveredHeadset {
    /// IPv4 address advertising the ADB service on this LAN, e.g. "192.168.1.42".
    pub ip: String,
    /// TCP port the service is listening on. Almost always 5555.
    pub port: u16,
    /// Hostname from the mDNS record (often something opaque like
    /// "adb-1WMHHB6DAW2145"). Useful for debugging.
    pub hostname: String,
    /// If we successfully connected and queried, this is the headset's
    /// real USB serial — what the user's saved pairing is keyed on.
    /// `None` means we found something at this IP but couldn't verify
    /// it's a Quest we know about.
    pub verified_serial: Option<String>,
}

/// Browse the local network for Quest devices advertising ADB-over-Wi-Fi.
/// Blocks for at most `timeout_ms` milliseconds. Returns whatever it finds;
/// an empty Vec is a normal "nothing on this network" answer, not an error.
///
/// `mdns-sd` uses crossbeam channels internally which are sync; we wrap the
/// whole thing in `spawn_blocking` so we don't park a tokio worker.
pub async fn discover(timeout_ms: u64) -> Vec<DiscoveredHeadset> {
    let timeout = Duration::from_millis(timeout_ms);
    tokio::task::spawn_blocking(move || discover_blocking(timeout))
        .await
        .unwrap_or_default()
}

fn discover_blocking(timeout: Duration) -> Vec<DiscoveredHeadset> {
    let daemon = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            tracing::debug!("mdns daemon failed to start: {e}");
            return Vec::new();
        }
    };

    // Browse both service types in parallel — we'll consume events from one
    // shared receiver pair.
    let modern_recv = match daemon.browse(ADB_SERVICE) {
        Ok(r) => Some(r),
        Err(e) => {
            tracing::debug!("mdns browse {ADB_SERVICE} failed: {e}");
            None
        }
    };
    let legacy_recv = daemon.browse(ADB_LEGACY_SERVICE).ok();

    let mut results: Vec<DiscoveredHeadset> = Vec::new();
    let deadline = Instant::now() + timeout;

    // Drain whichever channels are alive until the deadline.
    loop {
        let remaining = match deadline.checked_duration_since(Instant::now()) {
            Some(d) if !d.is_zero() => d,
            _ => break,
        };

        let mut got_anything = false;

        if let Some(rx) = modern_recv.as_ref() {
            // Per-channel timeout slice so we don't park forever on one channel.
            let slice = remaining.min(Duration::from_millis(250));
            if let Ok(event) = rx.recv_timeout(slice) {
                ingest_event(event, &mut results);
                got_anything = true;
            }
        }
        if let Some(rx) = legacy_recv.as_ref() {
            let slice = remaining.min(Duration::from_millis(250));
            if let Ok(event) = rx.recv_timeout(slice) {
                ingest_event(event, &mut results);
                got_anything = true;
            }
        }

        // If neither channel produced anything in this slice, just keep
        // looping until the deadline.
        if !got_anything && Instant::now() >= deadline {
            break;
        }
    }

    let _ = daemon.shutdown();
    dedupe_by_ip(results)
}

fn ingest_event(event: ServiceEvent, out: &mut Vec<DiscoveredHeadset>) {
    if let ServiceEvent::ServiceResolved(info) = event {
        let port = info.get_port();
        let hostname = info.get_hostname().to_string();
        for addr in info.get_addresses() {
            // Only IPv4; ADB doesn't reliably handle IPv6 in this flow.
            if addr.is_ipv4() {
                out.push(DiscoveredHeadset {
                    ip: addr.to_string(),
                    port,
                    hostname: hostname.clone(),
                    verified_serial: None,
                });
            }
        }
    }
}

fn dedupe_by_ip(mut v: Vec<DiscoveredHeadset>) -> Vec<DiscoveredHeadset> {
    v.sort_by(|a, b| a.ip.cmp(&b.ip));
    v.dedup_by(|a, b| a.ip == b.ip);
    v
}

/// Take a list of discovered candidates and try to identify each by its real
/// USB serial. We connect, query `getprop ro.serialno`, then disconnect.
/// Idempotent — running this on already-connected devices is a no-op.
pub async fn verify_serials(
    adb_path: &Path,
    discovered: &mut [DiscoveredHeadset],
) -> Result<()> {
    for d in discovered.iter_mut() {
        let target = format!("{}:{}", d.ip, d.port);
        // Best-effort connect. Skip on failure.
        if adb(adb_path, &["connect", &target]).await.is_err() {
            continue;
        }
        if let Ok(out) = adb_shell(adb_path, &target, &["getprop", "ro.serialno"]).await {
            let serial = out.trim().to_string();
            if !serial.is_empty() && serial != "null" {
                d.verified_serial = Some(serial);
            }
        }
    }
    Ok(())
}

/// Convenience: discover + verify in one call. Returns only headsets we could
/// positively identify by serial. This is what the wireless reconnect code
/// uses for "find any of my paired headsets on this network."
pub async fn discover_and_verify(
    adb_path: &Path,
    timeout_ms: u64,
) -> Vec<DiscoveredHeadset> {
    let mut found = discover(timeout_ms).await;
    if found.is_empty() {
        return found;
    }
    let _ = verify_serials(adb_path, &mut found).await;
    found.retain(|d| d.verified_serial.is_some());
    found
}
