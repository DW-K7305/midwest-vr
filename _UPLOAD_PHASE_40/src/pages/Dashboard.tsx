/**
 * Dashboard — the home view. Shows everything live in one place:
 *   1. Top stat strip: how many headsets are online, batteries that need
 *      charging, anything currently locked in Class Mode.
 *   2. Device grid: one card per headset, with battery / storage /
 *      currently-running app / connection type.
 *   3. Wireless connectivity panel: paired-headset list, pair-new for
 *      USB devices, reconnect-all. Used to be its own page; lives here
 *      now so a teacher's home view shows actual operational status.
 */

import { useNavigate } from "react-router-dom";
import { useDevices } from "@/hooks/useDevices";
import { DeviceCard } from "@/components/DeviceCard";
import { PageHeader } from "@/components/PageHeader";
import { WirelessPanel } from "@/components/WirelessPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Battery,
  Cable,
  Plug,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function Dashboard() {
  const nav = useNavigate();
  const { data: devices, refetch, isFetching, isError, error } = useDevices();
  const all = devices ?? [];
  const online = all.filter((d) => d.state === "device");
  const usb = online.filter((d) => d.connection_type === "usb").length;
  const wireless = online.filter((d) => d.connection_type === "wireless").length;
  const lowBatteryCount = online.filter(
    (d) => d.battery_pct != null && d.battery_pct < 20 && !d.battery_charging
  ).length;
  const empty = all.length === 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        subtitle="Live status across every connected headset"
        right={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")}
            />
            Refresh
          </Button>
        }
      />

      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {isError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
            <div className="font-medium text-destructive mb-1">
              Couldn't talk to adb
            </div>
            <div className="text-muted-foreground">
              {(error as { message?: string } | undefined)?.message ??
                "Try plugging in a headset, or restart the app."}
            </div>
          </div>
        )}

        {/* Stat strip — at-a-glance numbers, click any to refetch. */}
        {!empty && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label="Online"
              value={online.length}
              icon={Plug}
              tone={online.length > 0 ? "good" : "neutral"}
            />
            <Stat
              label="USB"
              value={usb}
              icon={Cable}
              tone="neutral"
            />
            <Stat
              label="Wireless"
              value={wireless}
              icon={Wifi}
              tone={wireless > 0 ? "good" : "neutral"}
            />
            <Stat
              label="Low battery"
              value={lowBatteryCount}
              icon={Battery}
              tone={lowBatteryCount > 0 ? "warn" : "neutral"}
            />
          </div>
        )}

        {empty ? (
          <EmptyState onConnect={() => nav("/setup")} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {all.map((d) => (
                <DeviceCard key={d.serial} device={d} />
              ))}
            </div>
            <WirelessPanel />
          </>
        )}
      </div>
    </div>
  );
}

interface StatProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "good" | "warn" | "neutral";
}

function Stat({ label, value, icon: Icon, tone }: StatProps) {
  const toneClass =
    tone === "good"
      ? "text-emerald-400 bg-emerald-500/10"
      : tone === "warn"
      ? "text-amber-400 bg-amber-500/10"
      : "text-muted-foreground bg-muted";
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div
          className={cn(
            "h-9 w-9 rounded-md flex items-center justify-center shrink-0",
            toneClass
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-semibold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <Card>
      <CardContent className="p-10">
        <div className="max-w-md text-center mx-auto">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Plug className="h-7 w-7 text-primary" />
          </div>
          <h2 className="text-lg font-semibold">No headsets yet</h2>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
            Plug a Meta Quest 2 into this Mac with USB-C. Brand new headsets
            need Developer Mode turned on first — the Headset Setup page walks
            you through it.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <Button onClick={onConnect}>Open Headset Setup</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
