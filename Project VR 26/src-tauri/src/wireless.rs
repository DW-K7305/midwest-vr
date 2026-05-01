//! Wireless ADB. Once a Quest 2 has been paired over USB, we can put it in
//! TCP/IP mode and talk to it over Wi-Fi for the rest of its life — only
//! requires both Mac and headset on the same network.

use crate::adb::{adb, adb_shell};
use crate::error::{AppError, Result};
use std::path::Path;

const TCP_PORT: u16 = 5555;

/// Switch the (currently USB-connected) headset's adb daemon to TCP/IP mode
/// and discover its Wi-Fi IP. Returns the IP as a string for caller to persist.
///
/// Phase 41 addition: also sets `adb_wifi_enabled = 1` in the headset's
/// global settings. This is the Android 11+ flag that tells the OS to
/// re-enable wireless ADB automatically on every boot. Without this, the
/// `adb tcpip` mode wipes whenever the headset reboots and requires a USB
/// re-pair. With this, the headset itself self-heals on its end — wireless
/// ADB comes back online about 30 seconds after every cold boot.
pub async fn pair_via_usb(adb_path: &Path, serial: &str) -> Result<String> {
    // 1. Read the headset's wlan0 IP. Two strategies, fallback chain:
    //    a) `ip -4 addr show wlan0` — modern Android, clean
    //    b) `ifconfig wlan0` — older fallback
    let ip = read_wlan_ip(adb_path, serial).await?;
    if ip.is_empty() {
        return Err(AppError::Other(anyhow::anyhow!(
            "Headset isn't on Wi-Fi. Connect it to a Wi-Fi network first (Settings → Wi-Fi on the headset)."
        )));
    }

    // 2. Put the daemon in TCP mode for THIS session.
    let _ = adb(adb_path, &["-s", serial, "tcpip", &TCP_PORT.to_string()]).await?;

    // 3. Make wireless ADB PERSIST across reboots. This is the line that
    //    turns this from a "works until you power-cycle the headset" feature
    //    into "works forever after one USB pair." Best-effort — older
    //    firmware ignores the setting silently, which is fine because we
    //    still got the per-session tcpip mode in step 2.
    let _ = adb_shell(
        adb_path,
        serial,
        &["settings", "put", "global", "adb_wifi_enabled", "1"],
    )
    .await;

    // 4. Brief pause for daemon to switch.
    tokio::time::sleep(std::time::Duration::from_millis(800)).await;

    // 5. Try connecting now so the user immediately sees it work.
    let _ = adb(adb_path, &["connect", &format!("{}:{}", ip, TCP_PORT)]).await;

    Ok(ip)
}

async fn read_wlan_ip(adb_path: &Path, serial: &str) -> Result<String> {
    // Try modern `ip -4 addr show wlan0`.
    if let Ok(out) = adb_shell(adb_path, serial, &["ip", "-4", "addr", "show", "wlan0"]).await {
        if let Some(ip) = parse_ip_from_ip_addr(&out) {
            return Ok(ip);
        }
    }
    // Fallback `ifconfig wlan0`.
    if let Ok(out) = adb_shell(adb_path, serial, &["ifconfig", "wlan0"]).await {
        if let Some(ip) = parse_ip_from_ifconfig(&out) {
            return Ok(ip);
        }
    }
    Ok(String::new())
}

fn parse_ip_from_ip_addr(s: &str) -> Option<String> {
    // Looking for "inet 192.168.x.y/24"
    for line in s.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix("inet ") {
            if let Some(addr) = rest.split_whitespace().next() {
                if let Some(ip) = addr.split('/').next() {
                    if !ip.starts_with("127.") && is_v4(ip) {
                        return Some(ip.to_string());
                    }
                }
            }
        }
    }
    None
}

fn parse_ip_from_ifconfig(s: &str) -> Option<String> {
    // Looking for "inet addr:192.168.x.y" or "inet 192.168.x.y"
    for line in s.lines() {
        let line = line.trim();
        for token in line.split_whitespace() {
            let candidate = if let Some(rest) = token.strip_prefix("addr:") {
                rest.to_string()
            } else if is_v4(token) {
                token.to_string()
            } else {
                continue;
            };
            if !candidate.starts_with("127.") && is_v4(&candidate) {
                return Some(candidate);
            }
        }
    }
    None
}

fn is_v4(s: &str) -> bool {
    let parts: Vec<&str> = s.split('.').collect();
    if parts.len() != 4 {
        return false;
    }
    parts.iter().all(|p| p.parse::<u8>().is_ok())
}

/// `adb connect <ip>:5555`.
///
/// Translates adb's terse failure output into a friendly message that hints at
/// the actual fix. The most common failure (an "Operation timed out" from adb
/// trying to reach a stale IP) is the case where plugging the headset into
/// USB once will trigger the auto-heal in the setup loop and update the IP.
pub async fn connect(adb_path: &Path, ip: &str) -> Result<()> {
    let target = format!("{}:{}", ip, TCP_PORT);
    let out = adb(adb_path, &["connect", &target]).await?;
    // adb returns 0 even when it failed; success/failure is in stdout.
    let trimmed = out.trim();
    if trimmed.starts_with("connected to") || trimmed.starts_with("already connected") {
        return Ok(());
    }
    // Friendly translations for the failure modes teachers actually hit.
    let lower = trimmed.to_ascii_lowercase();
    let friendly = if lower.contains("timed out") || lower.contains("timeout") {
        format!(
            "Couldn't reach {ip}:5555. The headset's IP may have changed since pairing, \
             or it's powered off. Plug it into USB once — we'll auto-refresh."
        )
    } else if lower.contains("connection refused") {
        format!(
            "{ip}:5555 refused the connection. The headset rebooted and lost wireless mode. \
             Plug it into USB once — we'll auto-refresh."
        )
    } else if lower.contains("no route to host") || lower.contains("network is unreachable") {
        format!(
            "{ip}:5555 isn't reachable on this network. Make sure the headset and this Mac are on the same Wi-Fi."
        )
    } else {
        format!("Wireless connect failed: {trimmed}")
    };
    Err(AppError::Other(anyhow::anyhow!(friendly)))
}

/// `adb disconnect <ip>:5555` (or all if ip empty).
pub async fn disconnect(adb_path: &Path, ip: &str) -> Result<()> {
    let target = format!("{}:{}", ip, TCP_PORT);
    let _ = adb(adb_path, &["disconnect", &target]).await?;
    Ok(())
}

/// Attempt to reconnect to every IP in `ips`, returning the subset that
/// succeeded.
pub async fn reconnect_all(adb_path: &Path, ips: &[String]) -> Vec<String> {
    let mut ok = Vec::new();
    for ip in ips {
        if connect(adb_path, ip).await.is_ok() {
            ok.push(ip.clone());
        }
    }
    ok
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ip_addr() {
        let s = "    inet 192.168.1.42/24 brd 192.168.1.255 scope global wlan0";
        assert_eq!(parse_ip_from_ip_addr(s), Some("192.168.1.42".to_string()));
    }
    #[test]
    fn parses_ifconfig() {
        let s = "wlan0: flags=4163  inet 10.0.0.7  netmask 255.255.255.0";
        assert_eq!(parse_ip_from_ifconfig(s), Some("10.0.0.7".to_string()));
    }
    #[test]
    fn is_v4_works() {
        assert!(is_v4("192.168.0.1"));
        assert!(!is_v4("not.an.ip.address"));
        assert!(!is_v4("999.999.999.999"));
    }
}
