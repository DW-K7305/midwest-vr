// Typed wrappers around tauri's invoke(). One file = one source of truth for
// every Rust command's signature.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AppSettings,
  BatchEvent,
  Catalog,
  CatalogApp,
  Device,
  InstalledApp,
  NetworkLogEntry,
  StorageInfo,
  WifiCreds,
} from "@/types";

export const api = {
  // Devices
  listDevices: () => invoke<Device[]>("list_devices"),
  deviceInfo: (serial: string) => invoke<Device>("device_info", { serial }),

  // Apps
  listApps: (serial: string, includeSystem = false) =>
    invoke<InstalledApp[]>("list_apps", { serial, includeSystem }),
  installApk: (serial: string, apkPath: string) =>
    invoke<void>("install_apk", { serial, apkPath }),
  uninstallPkg: (serial: string, pkg: string) =>
    invoke<void>("uninstall_pkg", { serial, package: pkg }),
  launchApp: (serial: string, pkg: string) =>
    invoke<void>("launch_app", { serial, package: pkg }),
  forceStop: (serial: string, pkg: string) =>
    invoke<void>("force_stop", { serial, package: pkg }),

  // Kiosk
  setKiosk: (serial: string, pkg: string) =>
    invoke<void>("set_kiosk", { serial, package: pkg }),
  clearKiosk: (serial: string) => invoke<void>("clear_kiosk", { serial }),
  currentKiosk: (serial: string) =>
    invoke<string | null>("current_kiosk", { serial }),

  // Wi-Fi
  provisionWifi: (serial: string, creds: WifiCreds) =>
    invoke<void>("provision_wifi", { serial, creds }),

  // Settings
  getSettings: () => invoke<AppSettings>("get_settings"),
  saveSettings: (settings: AppSettings) =>
    invoke<AppSettings>("save_settings", { settings }),
  getStorageInfo: () => invoke<StorageInfo>("get_storage_info"),

  // Health
  adbHealth: () => invoke<string>("adb_health"),

  // Catalog / Discovery
  catalogRefresh: () => invoke<Catalog>("catalog_refresh"),
  catalogGetCached: () => invoke<Catalog | null>("catalog_get_cached"),
  catalogRecommended: () => invoke<CatalogApp[]>("catalog_recommended"),
  discoverInstall: (appId: string, serials: string[]) =>
    invoke<void>("discover_install", { appId, serials }),
  discoverInstallRecommendedPack: (serials: string[]) =>
    invoke<void>("discover_install_recommended_pack", { serials }),

  // Network log + allowlist
  networkLog: () => invoke<NetworkLogEntry[]>("network_log"),
  networkClearLog: () => invoke<void>("network_clear_log"),
  networkAllowedHosts: () => invoke<string[]>("network_allowed_hosts"),
};

export function onDiscoverEvent(
  fn: (e: BatchEvent) => void
): Promise<UnlistenFn> {
  return listen<BatchEvent>("discover_event", (evt) => fn(evt.payload));
}

export interface InstallProgressEvent {
  serial: string;
  line: string;
}

export function onInstallProgress(
  fn: (e: InstallProgressEvent) => void
): Promise<UnlistenFn> {
  return listen<InstallProgressEvent>("install_progress", (evt) => fn(evt.payload));
}
