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
