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
mod network;
mod settings;
mod wifi;

use crate::adb::{ensure_server, resolve_adb_path};
use crate::apps::InstalledApp;
use crate::catalog::{Catalog, CatalogApp, CatalogStore};
use crate::devices::Device;
use crate::discover::BatchEvent;
use crate::error::{AppError, Result};
use crate::network::LogEntry as NetLogEntry;
use crate::settings::{AppSettings, SettingsStore, StorageInfo};
use crate::wifi::WifiCreds;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};

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
            // Best-effort: kick the adb server now so first-frame device list is fast.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(adb_path) = resolve_adb_path(&app_handle) {
                    let _ = adb::ensure_server(&adb_path).await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
