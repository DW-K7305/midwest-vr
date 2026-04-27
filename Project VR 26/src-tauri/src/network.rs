//! Allowlisted HTTPS client + in-memory network activity log.
//!
//! Every outbound request the app makes goes through this module. The host of
//! every URL is checked against a hardcoded allowlist before any socket opens.
//! Anything else is rejected outright. There is no "advanced settings" override —
//! this is enforced in Rust, not configurable from the frontend or settings file.
//!
//! Every request (allowed or rejected) is recorded in a ring buffer that the
//! Settings UI can show. No telemetry, no analytics, no PII collection.

use crate::error::{AppError, Result};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

/// Hosts MidWest-VR is allowed to talk to. Anything else is blocked.
///
/// Edit this list with caution — every entry expands what a compromised
/// catalog or runtime could reach. Keep it minimal.
const ALLOWED_HOSTS: &[&str] = &[
    // Catalog (curated K-12 app index, hosted in our GitHub repo).
    "raw.githubusercontent.com",
    // Direct APK downloads from these well-known publishers.
    "github.com",
    "objects.githubusercontent.com", // GitHub Releases asset CDN
    "cdn.sidequestvr.com",
    "files.sidequestvr.com",
    // Google's adb tools (already used at build time, listed for completeness).
    "dl.google.com",
];

#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub timestamp_ms: u128,
    pub method: String,
    pub url: String,
    pub host: String,
    pub purpose: String,
    pub allowed: bool,
    pub status: Option<u16>,
    pub bytes: Option<u64>,
    pub error: Option<String>,
}

const LOG_CAPACITY: usize = 200;

static LOG: OnceLock<Mutex<VecDeque<LogEntry>>> = OnceLock::new();

fn log() -> &'static Mutex<VecDeque<LogEntry>> {
    LOG.get_or_init(|| Mutex::new(VecDeque::with_capacity(LOG_CAPACITY)))
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn record(mut entry: LogEntry) {
    let mut q = log().lock().expect("network log poisoned");
    if q.len() == LOG_CAPACITY {
        q.pop_front();
    }
    entry.timestamp_ms = now_ms();
    q.push_back(entry);
}

pub fn snapshot_log() -> Vec<LogEntry> {
    let q = log().lock().expect("network log poisoned");
    q.iter().cloned().collect()
}

pub fn clear_log() {
    let mut q = log().lock().expect("network log poisoned");
    q.clear();
}

/// Returns the allowlist for display in the UI.
pub fn allowed_hosts() -> Vec<String> {
    ALLOWED_HOSTS.iter().map(|h| h.to_string()).collect()
}

fn host_allowed(host: &str) -> bool {
    let host_lower = host.to_ascii_lowercase();
    ALLOWED_HOSTS.iter().any(|h| h.eq_ignore_ascii_case(&host_lower))
}

/// Validate that a URL is HTTPS and points to an allowlisted host.
fn validate_url(url_str: &str) -> Result<url::Url> {
    let parsed = url::Url::parse(url_str)
        .map_err(|e| AppError::Config(format!("invalid url: {e}")))?;
    if parsed.scheme() != "https" {
        return Err(AppError::Config(format!(
            "only https is allowed, got {}",
            parsed.scheme()
        )));
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::Config("url has no host".into()))?;
    if !host_allowed(host) {
        return Err(AppError::Config(format!(
            "host '{host}' is not in the allowlist"
        )));
    }
    Ok(parsed)
}

fn make_client() -> std::result::Result<reqwest::Client, reqwest::Error> {
    reqwest::Client::builder()
        .user_agent(format!("MidWest-VR/{}", env!("CARGO_PKG_VERSION")))
        .https_only(true)
        .timeout(std::time::Duration::from_secs(60))
        .build()
}

/// GET a JSON document from an allowlisted URL.
pub async fn get_json<T: serde::de::DeserializeOwned>(url: &str, purpose: &str) -> Result<T> {
    let parsed = match validate_url(url) {
        Ok(u) => u,
        Err(e) => {
            record(LogEntry {
                timestamp_ms: 0,
                method: "GET".into(),
                url: url.to_string(),
                host: "—".into(),
                purpose: purpose.to_string(),
                allowed: false,
                status: None,
                bytes: None,
                error: Some(e.to_string()),
            });
            return Err(e);
        }
    };
    let host = parsed.host_str().unwrap_or("").to_string();

    let client = make_client().map_err(|e| AppError::Other(anyhow::anyhow!(e.to_string())))?;
    let resp = client.get(parsed.clone()).send().await;
    match resp {
        Ok(r) => {
            let status = r.status();
            let bytes_hint = r.content_length();
            if !status.is_success() {
                record(LogEntry {
                    timestamp_ms: 0,
                    method: "GET".into(),
                    url: url.to_string(),
                    host,
                    purpose: purpose.to_string(),
                    allowed: true,
                    status: Some(status.as_u16()),
                    bytes: bytes_hint,
                    error: Some(format!("http {}", status.as_u16())),
                });
                return Err(AppError::Other(anyhow::anyhow!(
                    "GET {} failed with status {}",
                    url,
                    status
                )));
            }
            let parsed: T = r
                .json()
                .await
                .map_err(|e| AppError::Parse(format!("json parse: {e}")))?;
            record(LogEntry {
                timestamp_ms: 0,
                method: "GET".into(),
                url: url.to_string(),
                host,
                purpose: purpose.to_string(),
                allowed: true,
                status: Some(status.as_u16()),
                bytes: bytes_hint,
                error: None,
            });
            Ok(parsed)
        }
        Err(e) => {
            record(LogEntry {
                timestamp_ms: 0,
                method: "GET".into(),
                url: url.to_string(),
                host,
                purpose: purpose.to_string(),
                allowed: true,
                status: None,
                bytes: None,
                error: Some(e.to_string()),
            });
            Err(AppError::Other(anyhow::anyhow!(e.to_string())))
        }
    }
}

/// Download a file from an allowlisted URL into `dest`, optionally verifying
/// SHA256. Reports per-chunk progress via `on_progress(downloaded, total_or_zero)`.
pub async fn download_to_file<F>(
    url: &str,
    dest: &std::path::Path,
    expected_sha256: Option<&str>,
    purpose: &str,
    mut on_progress: F,
) -> Result<()>
where
    F: FnMut(u64, u64),
{
    use futures_util::StreamExt;
    use sha2::{Digest, Sha256};
    use tokio::io::AsyncWriteExt;

    let parsed = match validate_url(url) {
        Ok(u) => u,
        Err(e) => {
            record(LogEntry {
                timestamp_ms: 0,
                method: "GET".into(),
                url: url.to_string(),
                host: "—".into(),
                purpose: purpose.to_string(),
                allowed: false,
                status: None,
                bytes: None,
                error: Some(e.to_string()),
            });
            return Err(e);
        }
    };
    let host = parsed.host_str().unwrap_or("").to_string();

    let client = make_client().map_err(|e| AppError::Other(anyhow::anyhow!(e.to_string())))?;
    let resp = client
        .get(parsed.clone())
        .send()
        .await
        .map_err(|e| AppError::Other(anyhow::anyhow!(e.to_string())))?;
    let status = resp.status();
    if !status.is_success() {
        record(LogEntry {
            timestamp_ms: 0,
            method: "GET".into(),
            url: url.to_string(),
            host,
            purpose: purpose.to_string(),
            allowed: true,
            status: Some(status.as_u16()),
            bytes: None,
            error: Some(format!("http {}", status.as_u16())),
        });
        return Err(AppError::Other(anyhow::anyhow!(
            "GET {} failed with status {}",
            url,
            status
        )));
    }
    let total = resp.content_length().unwrap_or(0);

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }
    let mut file = tokio::fs::File::create(dest).await?;
    let mut hasher = Sha256::new();
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let bytes =
            chunk.map_err(|e| AppError::Other(anyhow::anyhow!(e.to_string())))?;
        hasher.update(&bytes);
        file.write_all(&bytes).await?;
        downloaded += bytes.len() as u64;
        on_progress(downloaded, total);
    }
    file.flush().await?;
    drop(file);

    let actual = hex::encode(hasher.finalize());
    if let Some(expected) = expected_sha256 {
        if !actual.eq_ignore_ascii_case(expected) {
            // Refuse to keep a file that didn't match.
            let _ = tokio::fs::remove_file(dest).await;
            record(LogEntry {
                timestamp_ms: 0,
                method: "GET".into(),
                url: url.to_string(),
                host,
                purpose: purpose.to_string(),
                allowed: true,
                status: Some(status.as_u16()),
                bytes: Some(downloaded),
                error: Some(format!(
                    "sha256 mismatch (expected {}, got {})",
                    expected, actual
                )),
            });
            return Err(AppError::Other(anyhow::anyhow!(
                "downloaded file SHA256 did not match catalog ({} vs expected {})",
                actual,
                expected
            )));
        }
    }

    record(LogEntry {
        timestamp_ms: 0,
        method: "GET".into(),
        url: url.to_string(),
        host,
        purpose: purpose.to_string(),
        allowed: true,
        status: Some(status.as_u16()),
        bytes: Some(downloaded),
        error: None,
    });
    Ok(())
}
