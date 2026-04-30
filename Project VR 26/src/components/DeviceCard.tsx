import { useQuery } from "@tanstack/react-query";
import { useDeviceInfo } from "@/hooks/useDevices";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Battery,
  BatteryCharging,
  Cable,
  Cpu,
  HardDrive,
  Lock,
  Play,
  Tag,
  Wifi,
} from "lucide-react";
import { api } from "@/lib/tauri";
import { formatBytes, shortSerial } from "@/lib/utils";
import type { CatalogApp, Device } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  device: Device;
  onClick?: (serial: string) => void;
  selected?: boolean;
}

export function DeviceCard({ device, onClick, selected }: Props) {
  // Background-poll richer info for this card.
  const { data: enriched } = useDeviceInfo(
    device.state === "device" ? device.serial : undefined
  );
  const d = enriched ?? device;

  // Per-card kiosk lookup. Light-weight: one adb pull every 15s. The Class
  // Mode page invalidates this query so the indicator updates in real time.
  const kiosk = useQuery({
    queryKey: ["kiosk", d.serial],
    queryFn: () => api.currentKiosk(d.serial),
    enabled: d.state === "device",
    refetchInterval: 15000,
  });

  // Catalog-decoration of running app + kiosk app (so we show "Beat Saber"
  // instead of "com.beatgames.beatsaber"). Cheap because catalog is cached.
  const catalog = useQuery({
    queryKey: ["catalog_cached"],
    queryFn: api.catalogGetCached,
    staleTime: Infinity,
  });
  const friendlyName = (pkg: string | null | undefined): string | null => {
    if (!pkg) return null;
    const cat = (catalog.data?.apps ?? []).find((a: CatalogApp) => a.package === pkg);
    return cat?.name ?? pkg;
  };

  const stateBadge = (() => {
    switch (d.state) {
      case "device":
        return <Badge variant="success">Online</Badge>;
      case "unauthorized":
        return <Badge variant="warning">Tap “Allow” on headset</Badge>;
      case "offline":
        return <Badge variant="destructive">Offline</Badge>;
      default:
        return <Badge variant="outline">{d.state}</Badge>;
    }
  })();

  const isWireless = d.connection_type === "wireless";
  const battery = d.battery_pct;
  const charging = d.battery_charging ?? false;
  // Explicit null-checks because `storage_free === 0` is a real (full-disk)
  // value, and a truthy `&&` would silently render the dial as "unknown".
  const storagePctUsed =
    d.storage_total != null && d.storage_free != null && d.storage_total > 0
      ? Math.round(((d.storage_total - d.storage_free) / d.storage_total) * 100)
      : null;
  const lockedTo = kiosk.data ?? null;
  const runningApp = d.running_app ?? null;

  return (
    <Card
      onClick={() => onClick?.(d.serial)}
      className={cn(
        "transition-all cursor-pointer hover:border-primary/40",
        selected && "border-primary ring-2 ring-primary/20"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <div className="font-semibold text-base truncate">
              {d.model ?? "Unknown device"}
              {d.is_quest && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Meta Quest
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5 flex items-center gap-2">
              <span>{shortSerial(d.serial)}</span>
              {d.state === "device" && (
                <span
                  className="inline-flex items-center gap-1 text-[11px]"
                  title={
                    isWireless
                      ? "Connected over Wi-Fi (wireless ADB)"
                      : "Connected via USB-C cable"
                  }
                >
                  {isWireless ? (
                    <Wifi className="h-3 w-3" />
                  ) : (
                    <Cable className="h-3 w-3" />
                  )}
                  {isWireless ? "Wireless" : "USB"}
                </span>
              )}
            </div>
          </div>
          {stateBadge}
        </div>

        {/* Kiosk-locked banner — only shows if active. Compact, color-coded. */}
        {lockedTo && d.state === "device" && (
          <div className="mb-3 -mx-1 px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs flex items-center gap-1.5">
            <Lock className="h-3 w-3 text-emerald-400 shrink-0" />
            <span className="text-emerald-300">
              Class-locked to{" "}
              <strong className="font-medium">{friendlyName(lockedTo)}</strong>
            </span>
          </div>
        )}

        {/* Currently-running app — only when no kiosk is active so we don't
            duplicate the same info twice. */}
        {!lockedTo && runningApp && d.state === "device" && (
          <div className="mb-3 text-xs text-muted-foreground flex items-center gap-1.5 truncate">
            <Play className="h-3 w-3 shrink-0" />
            <span className="truncate">
              Now running: {friendlyName(runningApp)}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Stat
            icon={charging ? BatteryCharging : Battery}
            label="Battery"
            value={battery != null ? `${battery}%` : "—"}
            accent={
              battery == null
                ? undefined
                : battery > 60
                ? "ok"
                : battery > 20
                ? "warn"
                : "bad"
            }
          />
          <Stat
            icon={HardDrive}
            label="Storage"
            value={
              d.storage_free != null
                ? `${formatBytes(d.storage_free)} free`
                : "—"
            }
            sub={
              storagePctUsed != null ? `${storagePctUsed}% used` : undefined
            }
          />
          <Stat
            icon={Cpu}
            label="OS"
            value={d.android_release ? `Android ${d.android_release}` : "—"}
            sub={d.build_id ?? undefined}
          />
          <Stat
            icon={Tag}
            label="Manufacturer"
            value={d.manufacturer ?? "—"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: "ok" | "warn" | "bad";
}) {
  const tone =
    accent === "ok"
      ? "text-emerald-400"
      : accent === "warn"
      ? "text-amber-400"
      : accent === "bad"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={cn("font-medium truncate", tone)}>{value}</div>
        {sub && (
          <div className="text-xs text-muted-foreground truncate">{sub}</div>
        )}
      </div>
    </div>
  );
}
