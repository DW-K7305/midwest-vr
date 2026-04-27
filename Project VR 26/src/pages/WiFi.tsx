import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { DevicePicker } from "@/components/DevicePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Wifi as WifiIcon, Loader2 } from "lucide-react";
import { api } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices } from "@/hooks/useDevices";
import type { WifiSecurity } from "@/types";

export function WifiPage() {
  const { data: devices } = useDevices();
  const onlineDevices = (devices ?? []).filter((d) => d.state === "device");
  const [serial, setSerial] = useState<string | null>(null);
  const [ssid, setSsid] = useState("");
  const [psk, setPsk] = useState("");
  const [security, setSecurity] = useState<WifiSecurity>("wpa2psk");
  const [busy, setBusy] = useState(false);
  const [autoConnect, setAutoConnect] = useState(true);

  useEffect(() => {
    if (!serial && onlineDevices.length) setSerial(onlineDevices[0].serial);
  }, [onlineDevices, serial]);

  async function submit() {
    if (!serial || !ssid.trim()) return;
    setBusy(true);
    try {
      await api.provisionWifi(serial, {
        ssid: ssid.trim(),
        psk: security === "open" ? null : psk,
        security,
        auto_connect: autoConnect,
      });
      toast.success("Opened Wi-Fi panel on the headset — confirm there to join");
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Wi-Fi push failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Wi-Fi"
        subtitle="Send Wi-Fi credentials to a headset"
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-border p-4 space-y-4">
          <DevicePicker selected={serial} onSelect={setSerial} />
        </aside>
        <div className="flex-1 p-6 overflow-y-auto max-w-2xl">
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <WifiIcon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-medium">Network</div>
                  <div className="text-xs text-muted-foreground">
                    Quest opens its Wi-Fi panel; finish the join with one tap on
                    the headset.
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ssid">SSID</Label>
                <Input
                  id="ssid"
                  value={ssid}
                  onChange={(e) => setSsid(e.target.value)}
                  placeholder="ClassroomWiFi"
                />
              </div>

              <div className="space-y-2">
                <Label>Security</Label>
                <div className="flex gap-2">
                  <SecurityChip
                    label="Open"
                    active={security === "open"}
                    onClick={() => setSecurity("open")}
                  />
                  <SecurityChip
                    label="WPA2-PSK"
                    active={security === "wpa2psk"}
                    onClick={() => setSecurity("wpa2psk")}
                  />
                  <SecurityChip
                    label="WPA2-Enterprise"
                    active={security === "wpa2enterprise"}
                    onClick={() => setSecurity("wpa2enterprise")}
                  />
                </div>
                {security === "wpa2enterprise" && (
                  <p className="text-xs text-amber-400">
                    Enterprise networks need per-headset certificates and aren't
                    supported in v1.
                  </p>
                )}
              </div>

              {security === "wpa2psk" && (
                <div className="space-y-2">
                  <Label htmlFor="psk">Password</Label>
                  <Input
                    id="psk"
                    type="password"
                    value={psk}
                    onChange={(e) => setPsk(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoConnect}
                  onChange={(e) => setAutoConnect(e.target.checked)}
                  className="accent-primary"
                />
                Auto-connect when in range
              </label>

              <div>
                <Button
                  onClick={submit}
                  disabled={
                    !serial ||
                    !ssid.trim() ||
                    busy ||
                    security === "wpa2enterprise"
                  }
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <WifiIcon className="h-4 w-4 mr-2" />
                  )}
                  Send to headset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SecurityChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 h-8 rounded-md text-sm transition-colors border ${
        active
          ? "bg-primary/15 border-primary/40 text-foreground"
          : "border-border hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );
}
