import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";

/** Live list of attached headsets. Polls at the configured interval. */
export function useDevices(pollMs = 4000) {
  return useQuery({
    queryKey: ["devices"],
    queryFn: api.listDevices,
    refetchInterval: pollMs,
    refetchIntervalInBackground: true,
  });
}

export function useDeviceInfo(serial: string | undefined, pollMs = 6000) {
  return useQuery({
    queryKey: ["device", serial],
    queryFn: () => api.deviceInfo(serial!),
    enabled: !!serial,
    refetchInterval: pollMs,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: api.getSettings,
    staleTime: Infinity,
  });
}

export function useStorageInfo() {
  return useQuery({
    queryKey: ["storage_info"],
    queryFn: api.getStorageInfo,
    staleTime: Infinity,
  });
}
