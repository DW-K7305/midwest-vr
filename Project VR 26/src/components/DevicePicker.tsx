/**
 * Headset picker shown on the left rail of most pages.
 *
 * Why the rebuild: the previous version used `shortSerial(d.serial)` for both
 * USB and wireless headsets. Wireless serials are formatted as
 * "192.168.x.y:5555" — running them through shortSerial produced unreadable
 * garbage like "192.…5555" that looked like a bug to teachers. Now:
 *
 *   - Wireless headsets use the friendly label we saved at pair-time
 *     ("Quest_2 (2145)") plus the IP underneath.
 *   - USB headsets show model + 4-char tail of the real serial.
 *   - Tooltip on each row exposes the FULL identifying info on hover so
 *     nothing is hidden, just deprioritized visually.
 *   - Multi-line layout means long device names don't get clipped to "…".
 */

import { useQuery } from "@tanstack/react-query";
import { useDevices } from "@/hooks/useDevices";
import { Button } from "@/components/ui/button";
import { Cable, Check, Headphones, RefreshCw, Wifi } from "lucide-react";
import { api } from "@/lib/tauri";
import { cn, shortSerial } from "@/lib/utils";
import type { Device, PairedHeadset } from "@/types";

interface Props {
  selected: string | null;
  onSelect: (serial: string) => void;
}

export function DevicePicker({ selected, onSelect }: Props) {
  const { data: devices, refetch, isFetching } = useDevices();
  // Cross-reference pairings so wireless serials get human labels.
  const { data: paired } = useQuery({
    queryKey: ["wireless_paired"],
    queryFn: api.wirelessList,
    staleTime: 30_000,
  });
  const online = (devices ?? []).filter((d) => d.state === "device");

  return (
    <div className="rounded-lg border border-border p-3 bg-card/40">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Headset
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 px-2"
          data-no-drag
          title="Refresh device list"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>
      {online.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2 leading-relaxed">
          No online headsets — connect one via USB, or wait a few seconds for
          a paired wireless headset to come back online.
        </div>
      ) : (
        <div className="space-y-1">
          {online.map((d) => (
            <DeviceRow
              key={d.serial}
              device={d}
              paired={paired ?? []}
              selected={selected === d.serial}
              onClick={() => onSelect(d.serial)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RowProps {
  device: Device;
  paired: PairedHeadset[];
  selected: boolean;
  onClick: () => void;
}

function DeviceRow({ device: d, paired, selected, onClick }: RowProps) {
  const isWireless = d.connection_type === "wireless";

  // Resolve a friendly label and a short identifier line:
  //   - wireless → look up paired entry by IP, use saved label + show IP
  //   - usb      → use model + last 4 of real serial
  let primary: string;
  let secondary: string;
  if (isWireless) {
    const ip = d.serial.split(":")[0] ?? d.serial;
    const entry = paired.find((p) => p.ip === ip);
    primary = entry?.label ?? d.model ?? "Quest";
    secondary = ip; // just the IP, no port noise
  } else {
    primary = d.model ?? "Quest";
    secondary = shortSerial(d.serial);
  }

  // Compact battery readout. Stays as a faint tail on the right so the model
  // name keeps the visual focus.
  const battery = d.battery_pct;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${primary} • ${d.serial}${battery != null ? ` • ${battery}% battery` : ""}`}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        selected
          ? "bg-primary/15 text-foreground"
          : "hover:bg-accent text-foreground/90"
      )}
    >
      <Headphones className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate leading-tight">{primary}</div>
        <div className="text-[11px] text-muted-foreground font-mono truncate flex items-center gap-1.5 leading-tight mt-0.5">
          {isWireless ? (
            <Wifi className="h-3 w-3 shrink-0" />
          ) : (
            <Cable className="h-3 w-3 shrink-0" />
          )}
          <span className="truncate">{secondary}</span>
          {battery != null && (
            <span className="shrink-0 ml-auto">· {battery}%</span>
          )}
        </div>
      </div>
      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
    </button>
  );
}
