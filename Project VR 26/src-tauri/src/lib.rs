//! Tauri command surface for MidWest-VR.
//!
//! Every command returns `Result<T, AppError>` so failures show up as typed
//! errors on the frontend.

mod adb;
mod apps;
mod catalog;
mod devices;
mod discover;
mod error;
mod kiosk;
mod launcher;
mod network;
mod settings;
mod setup;
mod wifi;
mod wireless;

use crate::adb::{ensure_server, resolve_adb_path};
use crate::apps::InstalledApp;
use crate::catalog::{Catalog, CatalogApp, CatalogStore};
use crate::devices::Device;
use crate::discover::BatchEvent;
use crate::error::{AppError, Result};
use crate::kiosk::KioskResult;
use crate::launcher::{LauncherConfig, PushEvent as LauncherPushEvent};
use crate::network::LogEntry as NetLogEntry;
use crate::settings::{AppSettings, PairedHeadset, SettingsStore, StorageInfo};
use crate::wifi::WifiCreds;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

/// Shared app-wide state.
pub struct AppState {
    pub settings: Arc<SettingsStore>,
    pub catalog: Arc<CatalogStore>,
}

#[tauri::command]
async fn list_devices(app: AppHandle) -> Result<Vec<Device>> {
    let adb_path = resolve_adb_path(&app)?;
    ensure_server(&adb_path).await.ok();
    devices::list_basic(&adb_path).await
}

#[tauri::command]
async fn device_info(app: AppHandle, serial: String) -> Result<Device> {
    let adb_path = resolve_adb_path(&app)?;
    let mut basic = devices::list_basic(&adb_path).await?;
    let mut dev = basic
        .drain(..)
        .find(|d| d.serial == serial)
        .ok_or_else(|| AppError::DeviceOffline(serial.clone()))?;
    devices::enrich(&adb_path, &mut dev).await?;
    Ok(dev)
}

#[tauri::command]
async fn list_apps(
    app: AppHandle,
    serial: String,
    include_system: Option<bool>,
) -> Result<Vec<InstalledApp>> {
    let adb_path = resolve_adb_path(&app)?;
    apps::list(&adb_path, &serial, include_system.unwrap_or(false)).await
}

#[tauri::command]
async fn install_apk(app: AppHandle, serial: String, apk_path: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    let path = PathBuf::from(&apk_path);
    if !path.exists() {
        return Err(AppError::Config(format!("APK not found: {apk_path}")));
    }
    let app_handle = app.clone();
    let serial_for_event = serial.clone();
    apps::install(&adb_path, &serial, &path, |line| {
        let _ = app_handle.emit(
            "install_progress",
            serde_json::json!({
                "serial": serial_for_event,
                "line": line,
            }),
        );
    })
    .await?;
    Ok(())
}

#[tauri::command]
async fn uninstall_pkg(app: AppHandle, serial: String, package: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    apps::uninstall(&adb_path, &serial, &package).await
}

#[tauri::command]
async fn launch_app(app: AppHandle, serial: String, package: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    apps::launch(&adb_path, &serial, &package).await
}

#[tauri::command]
async fn force_stop(app: AppHandle, serial: String, package: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    apps::force_stop(&adb_path, &serial, &package).await
}

#[tauri::command]
async fn set_kiosk(app: AppHandle, serial: String, package: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    kiosk::set_kiosk(&adb_path, &serial, &package).await
}

#[tauri::command]
async fn clear_kiosk(app: AppHandle, serial: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    kiosk::clear_kiosk(&adb_path, &serial).await
}

#[tauri::command]
async fn current_kiosk(app: AppHandle, serial: String) -> Result<Option<String>> {
    let adb_path = resolve_adb_path(&app)?;
    kiosk::current_kiosk(&adb_path, &serial).await
}

#[tauri::command]
async fn set_kiosk_many(
    app: AppHandle,
    serials: Vec<String>,
    package: String,
) -> Result<Vec<KioskResult>> {
    let adb_path = resolve_adb_path(&app)?;
    Ok(kiosk::set_kiosk_many(&adb_path, &serials, &package).await)
}

#[tauri::command]
async fn clear_kiosk_many(
    app: AppHandle,
    serials: Vec<String>,
) -> Result<Vec<KioskResult>> {
    let adb_path = resolve_adb_path(&app)?;
    Ok(kiosk::clear_kiosk_many(&adb_path, &serials).await)
}

#[tauri::command]
async fn launcher_is_installed(app: AppHandle, serial: String) -> Result<bool> {
    let adb_path = resolve_adb_path(&app)?;
    launcher::is_installed(&adb_path, &serial).await
}

#[tauri::command]
async fn provision_wifi(app: AppHandle, serial: String, creds: WifiCreds) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    wifi::provision(&adb_path, &serial, &creds).await
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    state.settings.snapshot()
}

#[tauri::command]
fn get_storage_info(state: State<'_, AppState>) -> StorageInfo {
    state.settings.info()
}

#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> Result<AppSettings> {
    state.settings.update(settings)
}

#[tauri::command]
async fn adb_health(app: AppHandle) -> Result<String> {
    let adb_path = resolve_adb_path(&app)?;
    let v = adb::adb(&adb_path, &["version"]).await?;
    Ok(v.lines().next().unwrap_or("").to_string())
}

// ----- Discovery / Catalog commands -----

#[tauri::command]
async fn catalog_refresh(state: State<'_, AppState>) -> Result<Catalog> {
    let s = state.settings.snapshot();
    if !s.online_catalog_enabled {
        return Err(AppError::Config(
            "Online catalog is disabled in Settings.".into(),
        ));
    }
    state.catalog.refresh(&s.catalog_url).await
}

#[tauri::command]
fn catalog_get_cached(state: State<'_, AppState>) -> Option<Catalog> {
    state.catalog.snapshot()
}

#[tauri::command]
fn catalog_recommended(state: State<'_, AppState>) -> Vec<CatalogApp> {
    state
        .catalog
        .snapshot()
        .map(|c| discover::recommended_sideload_apps(&c))
        .unwrap_or_default()
}

#[tauri::command]
async fn discover_install(
    app: AppHandle,
    state: State<'_, AppState>,
    app_id: String,
    serials: Vec<String>,
) -> Result<()> {
    let s = state.settings.snapshot();
    if !s.online_catalog_enabled {
        return Err(AppError::Config(
            "Online catalog is disabled in Settings.".into(),
        ));
    }
    let cat = state
        .catalog
        .snapshot()
        .ok_or_else(|| AppError::Config("Catalog not loaded — refresh first.".into()))?;
    let entry = cat
        .apps
        .iter()
        .find(|a| a.id == app_id)
        .cloned()
        .ok_or_else(|| AppError::Config(format!("Catalog entry '{}' not found.", app_id)))?;

    let adb_path = resolve_adb_path(&app)?;
    let app_handle = app.clone();
    discover::install_to_many(&adb_path, &entry, &serials, move |evt: BatchEvent| {
        let _ = app_handle.emit("discover_event", evt);
    })
    .await
}

#[tauri::command]
async fn discover_install_recommended_pack(
    app: AppHandle,
    state: State<'_, AppState>,
    serials: Vec<String>,
) -> Result<()> {
    let s = state.settings.snapshot();
    if !s.online_catalog_enabled {
        return Err(AppError::Config(
            "Online catalog is disabled in Settings.".into(),
        ));
    }
    let cat = state
        .catalog
        .snapshot()
        .ok_or_else(|| AppError::Config("Catalog not loaded — refresh first.".into()))?;
    let recommended = discover::recommended_sideload_apps(&cat);
    if recommended.is_empty() {
        return Err(AppError::Config(
            "No recommended sideload apps in current catalog.".into(),
        ));
    }
    let adb_path = resolve_adb_path(&app)?;
    let app_handle = app.clone();
    for entry in recommended {
        let h = app_handle.clone();
        discover::install_to_many(&adb_path, &entry, &serials, move |evt| {
            let _ = h.emit("discover_event", evt);
        })
        .await
        .ok(); // continue with the next app even if one fails
    }
    Ok(())
}

#[tauri::command]
fn network_log() -> Vec<NetLogEntry> {
    network::snapshot_log()
}

#[tauri::command]
fn network_clear_log() {
    network::clear_log();
}

#[tauri::command]
fn network_allowed_hosts() -> Vec<String> {
    network::allowed_hosts()
}

// ----- Phase 28: Launcher push -----

#[tauri::command]
async fn launcher_push(
    app: AppHandle,
    serials: Vec<String>,
    apk_path: String,
    config: LauncherConfig,
    set_as_home: bool,
) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    let apk = std::path::PathBuf::from(&apk_path);
    let app_handle = app.clone();
    launcher::push_many(
        &adb_path,
        &serials,
        &apk,
        &config,
        set_as_home,
        move |evt: LauncherPushEvent| {
            let _ = app_handle.emit("launcher_push_event", evt);
        },
    )
    .await
}

// ----- Phase 29: Headset Setup Wizard -----

#[tauri::command]
async fn headset_rename(app: AppHandle, serial: String, name: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    setup::rename(&adb_path, &serial, &name).await
}

#[tauri::command]
async fn headset_reboot(app: AppHandle, serial: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    setup::reboot(&adb_path, &serial).await
}

#[tauri::command]
async fn headset_power_off(app: AppHandle, serial: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    setup::power_off(&adb_path, &serial).await
}

#[tauri::command]
async fn headset_factory_reset(app: AppHandle, serial: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    setup::factory_reset(&adb_path, &serial).await
}

#[tauri::command]
async fn headset_sync_time(app: AppHandle, serial: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    setup::sync_time(&adb_path, &serial).await
}

#[tauri::command]
async fn headset_screenshot(app: AppHandle, serial: String) -> Result<String> {
    let adb_path = resolve_adb_path(&app)?;
    // Save next to the bundle when in portable mode, otherwise ~/Documents.
    let dest_dir = dirs::document_dir()
        .map(|p| p.join("MidWest-VR-Screenshots"))
        .unwrap_or_else(|| std::env::temp_dir());
    let path = setup::screenshot(&adb_path, &serial, &dest_dir).await?;
    Ok(path.display().to_string())
}

// ----- Phase 30: Wireless ADB -----

#[tauri::command]
async fn wireless_pair(
    app: AppHandle,
    state: State<'_, AppState>,
    serial: String,
) -> Result<PairedHeadset> {
    let adb_path = resolve_adb_path(&app)?;
    let ip = wireless::pair_via_usb(&adb_path, &serial).await?;
    // Try to enrich with the device's model so the UI shows a friendly label.
    let label = devices::list_basic(&adb_path)
        .await
        .ok()
        .and_then(|v| v.into_iter().find(|d| d.serial == serial))
        .and_then(|d| d.model)
        .unwrap_or_else(|| "Quest".to_string());
    let serial_tail: String = {
        let chars: Vec<char> = serial.chars().collect();
        let n = chars.len();
        chars.into_iter().skip(n.saturating_sub(4)).collect()
    };
    let entry = PairedHeadset {
        label: format!("{} ({})", label, serial_tail),
        serial: serial.clone(),
        ip: ip.clone(),
    };
    // Persist (replacing any existing entry for the same serial).
    let mut s = state.settings.snapshot();
    s.paired_wireless.retain(|p| p.serial != serial);
    s.paired_wireless.push(entry.clone());
    state.settings.update(s)?;
    Ok(entry)
}

#[tauri::command]
async fn wireless_connect(app: AppHandle, ip: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    wireless::connect(&adb_path, &ip).await
}

#[tauri::command]
async fn wireless_disconnect(app: AppHandle, ip: String) -> Result<()> {
    let adb_path = resolve_adb_path(&app)?;
    wireless::disconnect(&adb_path, &ip).await
}

#[tauri::command]
async fn wireless_forget(state: State<'_, AppState>, serial: String) -> Result<()> {
    let mut s = state.settings.snapshot();
    s.paired_wireless.retain(|p| p.serial != serial);
    state.settings.update(s)?;
    Ok(())
}

#[tauri::command]
fn wireless_list(state: State<'_, AppState>) -> Vec<PairedHeadset> {
    state.settings.snapshot().paired_wireless
}

#[tauri::command]
async fn wireless_reconnect_all(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Vec<String>> {
    let adb_path = resolve_adb_path(&app)?;
    let ips: Vec<String> = state
        .settings
        .snapshot()
        .paired_wireless
        .into_iter()
        .map(|p| p.ip)
        .collect();
    Ok(wireless::reconnect_all(&adb_path, &ips).await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .compact()
        .init();

    let settings = Arc::new(SettingsStore::load().expect("failed to load settings"));
    // Cache catalog next to the config file so it travels with the SSD.
    let catalog_cache_dir = settings
        .info()
        .config_path
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| std::env::temp_dir());
    let catalog = Arc::new(CatalogStore::new(catalog_cache_dir));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .manage(AppState { settings, catalog })
        .invoke_handler(tauri::generate_handler![
            list_devices,
            device_info,
            list_apps,
            install_apk,
            uninstall_pkg,
            launch_app,
            force_stop,
            set_kiosk,
            clear_kiosk,
            current_kiosk,
            set_kiosk_many,
            clear_kiosk_many,
            launcher_is_installed,
            provision_wifi,
            get_settings,
            get_storage_info,
            save_settings,
            adb_health,
            catalog_refresh,
            catalog_get_cached,
            catalog_recommended,
            discover_install,
            discover_install_recommended_pack,
            network_log,
            network_clear_log,
            network_allowed_hosts,
            launcher_push,
            headset_rename,
            headset_reboot,
            headset_power_off,
            headset_factory_reset,
            headset_sync_time,
            headset_screenshot,
            wireless_pair,
            wireless_connect,
            wireless_disconnect,
            wireless_forget,
            wireless_list,
            wireless_reconnect_all,
        ])
        .setup(|app| {
            // Ensure the bundled adb is executable. macOS preserves bits when
            // copying, but if the user manually replaced the file we re-fix it.
            #[cfg(unix)]
            if let Ok(p) = resolve_adb_path(app.handle()) {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = std::fs::metadata(&p) {
                    let mut perms = meta.permissions();
                    perms.set_mode(0o755);
                    let _ = std::fs::set_permissions(&p, perms);
                }
            }
            // Best-effort: kick the adb server now so first-frame device list is fast,
            // then run a forever-loop that silently retries wireless reconnect every
            // 30 seconds. Once a headset is paired over USB, this loop is what keeps
            // it talking to the Mac for the rest of the day with zero user action.
            let app_handle = app.handle().clone();
            let settings_handle = app.state::<AppState>().settings.clone();
            tauri::async_runtime::spawn(async move {
                let adb_path = match resolve_adb_path(&app_handle) {
                    Ok(p) => p,
                    Err(e) => {
                        tracing::warn!("adb not resolvable, wireless auto-reconnect disabled: {e}");
                        return;
                    }
                };
                let _ = adb::ensure_server(&adb_path).await;
                // Initial pass — short delay so the UI is up before we yell about devices.
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                loop {
                    let paired_ips: Vec<String> = settings_handle
                        .snapshot()
                        .paired_wireless
                        .into_iter()
                        .map(|p| p.ip)
                        .collect();
                    if !paired_ips.is_empty() {
                        // `reconnect_all` is idempotent — `adb connect` to an
                        // already-connected target is a no-op, so we don't
                        // thrash anything by re-running this every 30s.
                        let _ok = wireless::reconnect_all(&adb_path, &paired_ips).await;
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
