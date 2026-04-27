import { useDeviceInfo } from "@/hooks/useDevices";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Battery, BatteryCharging, HardDrive, Cpu, Tag } from "lucide-react";
import { formatBytes, shortSerial } from "@/lib/utils";
import type { Device } from "@/types";
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

  const battery = d.battery_pct;
  const charging = d.battery_charging ?? false;
  const storagePctUsed =
    d.storage_total && d.storage_free
      ? Math.round(((d.storage_total - d.storage_free) / d.storage_total) * 100)
      : null;

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
          <div>
            <div className="font-semibold text-base">
              {d.model ?? "Unknown device"}
              {d.is_quest && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  Meta Quest
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground font-mono mt-0.5">
              {shortSerial(d.serial)}
            </div>
          </div>
          {stateBadge}
        </div>

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
