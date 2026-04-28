import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { DevicePicker } from "@/components/DevicePicker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpBubble } from "@/components/ui/tooltip";
import {
  Cable,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { api } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices } from "@/hooks/useDevices";
import type { PairedHeadset } from "@/types";

export function Wireless() {
  const qc = useQueryClient();
  const { data: devices } = useDevices();
  const usbDevices = (devices ?? []).filter(
    (d) => d.state === "device" && !d.serial.includes(":")
  );
  // Wireless devices come back as "ip:port" serials (e.g. "192.168.1.42:5555").
  const wirelessConnected = (devices ?? []).filter(
    (d) => d.state === "device" && d.serial.includes(":")
  );
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  const paired = useQuery({
    queryKey: ["wireless_paired"],
    queryFn: api.wirelessList,
  });

  async function pair() {
    if (!selectedSerial) {
      toast.error("Pick a USB-connected headset first.");
      return;
    }
    setPairing(true);
    try {
      const entry = await api.wirelessPair(selectedSerial);
      qc.invalidateQueries({ queryKey: ["wireless_paired"] });
      toast.success(`Wireless pairing complete — ${entry.label} at ${entry.ip}`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Pairing failed");
    } finally {
      setPairing(false);
    }
  }

  async function reconnect(p: PairedHeadset) {
    try {
      await api.wirelessConnect(p.ip);
      toast.success(`Connected to ${p.label}`);
    } catch (e: unknown) {
      toast.error(
        `${p.label}: ${(e as { message?: string })?.message ?? "connect failed"}`
      );
    }
  }

  async function reconnectAll() {
    try {
      const ok = await api.wirelessReconnectAll();
      toast.success(
        `Reconnected ${ok.length} of ${paired.data?.length ?? 0} paired headsets`
      );
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Reconnect failed");
    }
  }

  async function disconnect(p: PairedHeadset) {
    try {
      await api.wirelessDisconnect(p.ip);
      toast.success(`Disconnected ${p.label}`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Disconnect failed");
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

  function isCurrentlyConnected(ip: string) {
    return wirelessConnected.some((d) => d.serial.startsWith(ip + ":"));
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Wireless"
        subtitle="Pair a Quest 2 over USB once — manage it over Wi-Fi after that"
        right={
          <Button variant="outline" size="sm" onClick={reconnectAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Try reconnecting all
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl">
        {/* How it works */}
        <Card>
          <CardContent className="p-5 space-y-2 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Wifi className="h-4 w-4 text-primary" />
              How wireless works
            </div>
            <p className="text-muted-foreground leading-relaxed">
              <strong>One-time:</strong> plug a headset into your Mac with USB-C, pick
              it on the left, and click <strong>Pair this headset wirelessly</strong>.
              MidWest-VR remembers its IP address.
              <br />
              <br />
              <strong>From then on:</strong> as long as the headset is on the same
              Wi-Fi as your Mac, you can manage it without the cable. Plug stays
              optional. MidWest-VR auto-reconnects on launch.
            </p>
            <p className="text-amber-400/90 text-xs pt-1 leading-relaxed">
              Heads-up: when the headset reboots, its Wi-Fi IP can change. If a
              wireless headset goes offline, plug it back in via USB and click
              "Pair this headset wirelessly" again — it's instant the second
              time.
            </p>
          </CardContent>
        </Card>

        {/* Pair section */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 font-medium">
              <Cable className="h-4 w-4 text-primary" />
              Pair a USB-connected headset
              <HelpBubble label="Pick a headset that's currently plugged in via USB-C and click pair. We'll switch its adb daemon to wireless mode and remember its IP." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DevicePicker
                selected={selectedSerial}
                onSelect={setSelectedSerial}
              />
              <div className="flex flex-col justify-center gap-2">
                {usbDevices.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No USB-connected headsets right now. Plug one in to pair it
                    wirelessly.
                  </div>
                ) : (
                  <Button
                    onClick={pair}
                    disabled={!selectedSerial || pairing}
                    size="lg"
                  >
                    {pairing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4 mr-2" />
                    )}
                    Pair this headset wirelessly
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  The headset must already be on Wi-Fi (use the Wi-Fi tab to
                  push credentials if it isn't).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Paired headsets list */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <Wifi className="h-4 w-4 text-primary" />
                Wirelessly paired headsets
              </div>
              <Badge variant="outline">
                {paired.data?.length ?? 0} paired
              </Badge>
            </div>
            {paired.isLoading ? (
              <div className="text-sm text-muted-foreground py-2">Loading…</div>
            ) : (paired.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                No wireless headsets paired yet. Pair one above.
              </div>
            ) : (
              <div className="rounded-md border border-border divide-y divide-border">
                {paired.data!.map((p) => {
                  const live = isCurrentlyConnected(p.ip);
                  return (
                    <div
                      key={p.serial}
                      className="px-3 py-3 flex items-center gap-3"
                    >
                      <div
                        className={
                          "h-9 w-9 rounded-md flex items-center justify-center shrink-0 " +
                          (live ? "bg-emerald-500/15" : "bg-muted")
                        }
                      >
                        {live ? (
                          <Wifi className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <WifiOff className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.label}</div>
                        <div className="text-xs font-mono text-muted-foreground truncate">
                          {p.ip}:5555 · {p.serial}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-1.5">
                        {live ? (
                          <Badge variant="success">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Connected
                          </Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reconnect(p)}
                          >
                            <Wifi className="h-3.5 w-3.5 mr-1.5" />
                            Connect
                          </Button>
                        )}
                        {live && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => disconnect(p)}
                          >
                            Disconnect
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => forget(p)}
                          title="Forget this headset"
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
      </div>
    </div>
  );
}
