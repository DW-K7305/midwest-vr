// Mirrors src-tauri/src/devices.rs::Device
export interface Device {
  serial: string;
  state: string; // "device" | "unauthorized" | "offline" | "no permissions" | ...
  model: string | null;
  manufacturer: string | null;
  product: string | null;
  android_release: string | null;
  build_id: string | null;
  battery_pct: number | null;
  battery_charging: boolean | null;
  storage_free: number | null;
  storage_total: number | null;
  is_quest: boolean;
  /** Derived from the serial format on the backend. */
  connection_type: "usb" | "wireless";
  running_app: string | null;
}

export interface InstalledApp {
  package: string;
  version_name: string | null;
  version_code: number | null;
  label: string | null;
  is_system: boolean;
  apk_path: string | null;
}

export type WifiSecurity = "open" | "wpa2psk" | "wpa2enterprise";
export interface WifiCreds {
  ssid: string;
  psk: string | null;
  security: WifiSecurity;
  auto_connect: boolean;
}

export type Theme = "dark" | "light" | "system";
export interface AppSettings {
  poll_interval_ms: number;
  auto_select_first_device: boolean;
  theme: Theme;
  config_dir_override: string | null;
  online_catalog_enabled: boolean;
  catalog_url: string;
}

export type InstallSource = "sideload" | "store";

export interface CatalogApp {
  id: string;
  name: string;
  publisher: string;
  short_desc: string;
  long_desc: string;
  subjects: string[];
  grade_bands: string[];
  age_rating: string;
  license: string;
  source: InstallSource;
  source_url: string;
  apk_url: string | null;
  apk_sha256: string | null;
  apk_size_bytes: number | null;
  package: string | null;
  thumbnail_url: string | null;
  screenshots: string[];
  recommended: boolean;
}

export interface Catalog {
  schema_version: number;
  last_updated: string;
  apps: CatalogApp[];
}

export interface NetworkLogEntry {
  timestamp_ms: number;
  method: string;
  url: string;
  host: string;
  purpose: string;
  allowed: boolean;
  status: number | null;
  bytes: number | null;
  error: string | null;
}

export type BatchEvent =
  | { type: "download_start"; app_id: string }
  | { type: "download_progress"; app_id: string; downloaded: number; total: number }
  | { type: "download_done"; app_id: string }
  | { type: "headset_start"; app_id: string; serial: string }
  | { type: "headset_line"; app_id: string; serial: string; line: string }
  | { type: "headset_done"; app_id: string; serial: string }
  | { type: "headset_fail"; app_id: string; serial: string; error: string };

export interface LauncherConfig {
  school_name: string;
  greeting: string;
  include_system: boolean;
  allowlist: string[];
}

export type LauncherPushEvent =
  | { type: "headset_start"; serial: string }
  | { type: "headset_install"; serial: string }
  | { type: "headset_config"; serial: string }
  | { type: "headset_set_home"; serial: string }
  | { type: "headset_done"; serial: string }
  | { type: "headset_fail"; serial: string; error: string };

export interface PairedHeadset {
  label: string;
  serial: string;
  ip: string;
}

export interface StorageInfo {
  portable: boolean;
  config_path: string;
  volume_root: string | null;
}

export interface AppError {
  kind: "AdbMissing" | "AdbFailed" | "DeviceOffline" | "Io" | "Parse" | "Config" | "Other";
  message: string;
}

/** Per-headset result from a bulk kiosk operation. */
export interface KioskResult {
  serial: string;
  ok: boolean;
  error: string | null;
}
