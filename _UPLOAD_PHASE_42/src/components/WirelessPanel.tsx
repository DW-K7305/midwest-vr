/**
 * Wireless ADB management — paired list + pair-new + reconnect-all.
 *
 * Originally a standalone page (`/wireless`); now embedded on the Dashboard
 * because for a teacher running a fleet, "what's paired wirelessly" is just
 * fleet status — it belongs alongside the device cards, not in its own
 * sidebar item. This component is a self-contained drop-in: pulls its own
 * data, fires its own toasts, no props.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDevices } from "@/hooks/useDevices";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cable,
  CheckCircle2,
  Loader2,
  Radar,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import type { PairedHeadset } from "@/types";

export function WirelessPanel() {
  const qc = useQueryClient();
  const { data: devices } = useDevices();
  const usbDevices = (devices ?? []).filter(
    (d) => d.state === "device" && d.connection_type === "usb"
  );
  const wirelessConnected = (devices ?? []).filter(
    (d) => d.state === "device" && d.connection_type === "wireless"
  );
  const [pairing, setPairing] = useState<string | null>(null);
  const [relocating, setRelocating] = useState(false);

  const paired = useQuery({
    queryKey: ["wireless_paired"],
    queryFn: api.wirelessList,
  });

  function isLive(ip: string) {
    return wirelessConnected.some((d) => d.serial.startsWith(ip + ":"));
  }

  async function pair(serial: string) {
    setPairing(serial);
    try {
      const entry = await api.wirelessPair(serial);
      qc.invalidateQueries({ queryKey: ["wireless_paired"] });
      toast.success(`Paired ${entry.label}. You can unplug the cable now.`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Pairing failed");
    } finally {
      setPairing(null);
    }
  }

  async function reconnectAll() {
    try {
      const ok = await api.wirelessReconnectAll();
      const total = paired.data?.length ?? 0;
      toast.success(`Reconnected ${ok.length} of ${total} paired headsets.`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Reconnect failed");
    }
  }

  async function relocate() {
    setRelocating(true);
    try {
      const updated = await api.wirelessRelocate();
      qc.invalidateQueries({ queryKey: ["wireless_paired"] });
      if (updated === 0) {
        toast.warning(
          "No paired Quests found on this Wi-Fi via mDNS. Plug into USB to re-pair."
        );
      } else {
        toast.success(
          `Found ${updated} headset${updated === 1 ? "" : "s"} on this network — IPs updated.`
        );
      }
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Discovery failed");
    } finally {
      setRelocating(false);
    }
  }

  async function reconnectOne(p: PairedHeadset) {
    try {
      await api.wirelessConnect(p.ip);
      toast.success(`Connected to ${p.label}`);
    } catch (e: unknown) {
      toast.error(`${p.label}: ${(e as { message?: string })?.message ?? "failed"}`);
    }
  }

  async function forget(p: PairedHeadset) {
    try {
      await api.wirelessForget(p.serial);
      qc.invalidateQueries({ queryKey: ["wireless_paired"] });
      toast.success(`Forgot ${p.label}`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Forget failed");
    }
  }

  const pairedCount = paired.data?.length ?? 0;
  const liveCount = (paired.data ?? []).filter((p) => isLive(p.ip)).length;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Wireless connectivity</h3>
            <Badge variant="outline" className="ml-1">
              {liveCount}/{pairedCount} online
            </Badge>
          </div>
          {pairedCount > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={relocate}
                disabled={relocating}
                title="Scan this Wi-Fi for your paired headsets and update IPs. Use after moving to a new network."
              >
                {relocating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Radar className="h-3.5 w-3.5 mr-1.5" />
                )}
                Find on this network
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={reconnectAll}
                title="Manually retry every paired headset right now"
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Reconnect
              </Button>
            </div>
          )}
        </div>

        {/* Pair-new strip — shows up only when there's a USB headset to pair. */}
        {usbDevices.length > 0 && (
          <div className="mb-4 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium mb-1.5">
              <Cable className="h-4 w-4 text-primary" />
              {usbDevices.length === 1
                ? "USB-connected headset ready to pair"
                : `${usbDevices.length} USB-connected headsets ready to pair`}
            </div>
            <p className="text-xs text-muted-foreground mb-2.5">
              Pair once over USB → manage forever over Wi-Fi. Headset must
              already be on the same network as this Mac.
            </p>
            <div className="space-y-1.5">
              {usbDevices.map((d) => {
                const alreadyPaired = (paired.data ?? []).some(
                  (p) => p.serial === d.serial
                );
                return (
                  <div
                    key={d.serial}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="flex-1 truncate font-mono text-xs">
                      {d.model ?? "Quest"} · {d.serial}
                    </span>
                    {alreadyPaired ? (
                      <Badge variant="success" className="text-[10px]">
                        Already paired
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => pair(d.serial)}
                        disabled={pairing === d.serial}
                      >
                        {pairing === d.serial ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Wifi className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Pair wirelessly
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Paired list */}
        {paired.isLoading ? (
          <div className="text-sm text-muted-foreground py-2">Loading…</div>
        ) : pairedCount === 0 ? (
          <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
            No headsets paired wirelessly yet.{" "}
            {usbDevices.length === 0
              ? "Plug a Quest into USB-C to pair it."
              : "Use the strip above to pair the connected one."}
          </div>
        ) : (
          <div className="rounded-md border border-border divide-y divide-border">
            {paired.data!.map((p) => {
              const live = isLive(p.ip);
              const onUsbNow = usbDevices.some((d) => d.serial === p.serial);
              return (
                <div
                  key={p.serial}
                  className="px-3 py-2.5 flex items-center gap-3"
                >
                  <div
                    className={
                      "h-9 w-9 rounded-md flex items-center justify-center shrink-0 " +
                      (live ? "bg-emerald-500/15" : "bg-muted")
                    }
                    title={live ? "Connected over Wi-Fi" : "Saved but currently offline"}
                  >
                    {live ? (
                      <Wifi className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.label}</div>
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      {p.ip}
                      {!live && !onUsbNow && (
                        <span className="ml-2 text-amber-400/80 font-sans">
                          · offline — IP may have changed
                        </span>
                      )}
                      {!live && onUsbNow && (
                        <span className="ml-2 text-primary font-sans">
                          · on USB — auto-healing in a few seconds…
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    {live ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Online
                      </Badge>
                    ) : onUsbNow ? (
                      <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                        <Cable className="h-3 w-3" />
                        Healing…
                      </Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => reconnectOne(p)}
                        title="Try the saved IP. If it fails, plug into USB to auto-heal."
                      >
                        <Wifi className="h-3.5 w-3.5 mr-1.5" />
                        Try
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => forget(p)}
                      title="Forget this headset (you'll need to USB-pair again)"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
