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
  DiscoveredHeadset,
  InstalledApp,
  KioskResult,
  LauncherConfig,
  LauncherPushEvent,
  NetworkLogEntry,
  PairedHeadset,
  Profile,
  ProfileApplyEvent,
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

  // Kiosk / Class Mode
  setKiosk: (serial: string, pkg: string) =>
    invoke<void>("set_kiosk", { serial, package: pkg }),
  clearKiosk: (serial: string) => invoke<void>("clear_kiosk", { serial }),
  currentKiosk: (serial: string) =>
    invoke<string | null>("current_kiosk", { serial }),
  setKioskMany: (serials: string[], pkg: string) =>
    invoke<KioskResult[]>("set_kiosk_many", { serials, package: pkg }),
  clearKioskMany: (serials: string[]) =>
    invoke<KioskResult[]>("clear_kiosk_many", { serials }),
  launcherIsInstalled: (serial: string) =>
    invoke<boolean>("launcher_is_installed", { serial }),

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

  // Launcher push (Phase 28)
  launcherPush: (
    serials: string[],
    apkPath: string,
    config: LauncherConfig,
    setAsHome: boolean
  ) =>
    invoke<void>("launcher_push", {
      serials,
      apkPath,
      config,
      setAsHome,
    }),

  // Headset Setup Wizard (Phase 29)
  headsetRename: (serial: string, name: string) =>
    invoke<void>("headset_rename", { serial, name }),
  headsetReboot: (serial: string) => invoke<void>("headset_reboot", { serial }),
  headsetPowerOff: (serial: string) =>
    invoke<void>("headset_power_off", { serial }),
  headsetFactoryReset: (serial: string) =>
    invoke<void>("headset_factory_reset", { serial }),
  headsetSyncTime: (serial: string) =>
    invoke<void>("headset_sync_time", { serial }),
  headsetScreenshot: (serial: string) =>
    invoke<string>("headset_screenshot", { serial }),

  // Wireless ADB (Phase 30)
  wirelessPair: (serial: string) =>
    invoke<PairedHeadset>("wireless_pair", { serial }),
  wirelessConnect: (ip: string) => invoke<void>("wireless_connect", { ip }),
  wirelessDisconnect: (ip: string) =>
    invoke<void>("wireless_disconnect", { ip }),
  wirelessForget: (serial: string) =>
    invoke<void>("wireless_forget", { serial }),
  wirelessList: () => invoke<PairedHeadset[]>("wireless_list"),
  wirelessReconnectAll: () =>
    invoke<string[]>("wireless_reconnect_all"),
  wirelessDiscoverLocal: (timeoutMs?: number) =>
    invoke<DiscoveredHeadset[]>("wireless_discover_local", { timeoutMs }),
  /** "I moved buildings" — discover on this network, update saved IPs, return count. */
  wirelessRelocate: () => invoke<number>("wireless_relocate"),

  // Profiles (Phase 40)
  profileList: () => invoke<Profile[]>("profile_list"),
  profileSave: (profile: Profile) =>
    invoke<Profile[]>("profile_save", { profile }),
  profileDelete: (id: string) => invoke<Profile[]>("profile_delete", { id }),
  profileApply: (serial: string, profileId: string) =>
    invoke<void>("profile_apply", { serial, profileId }),
  profileDevModeCheck: (serial: string) =>
    invoke<boolean>("profile_devmode_check", { serial }),
  profileCurrentDeviceName: (serial: string) =>
    invoke<string>("profile_current_device_name", { serial }),
};

export function onProfileApplyEvent(
  fn: (e: ProfileApplyEvent) => void
): Promise<UnlistenFn> {
  return listen<ProfileApplyEvent>("profile_apply_event", (evt) =>
    fn(evt.payload)
  );
}

export function onDiscoverEvent(
  fn: (e: BatchEvent) => void
): Promise<UnlistenFn> {
  return listen<BatchEvent>("discover_event", (evt) => fn(evt.payload));
}

export function onLauncherPushEvent(
  fn: (e: LauncherPushEvent) => void
): Promise<UnlistenFn> {
  return listen<LauncherPushEvent>("launcher_push_event", (evt) =>
    fn(evt.payload)
  );
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
