/**
 * HeadsetPanel — the per-headset command center.
 *
 * Click any device card on the Dashboard → this panel opens with everything
 * for that single headset in one place: rename, restart, screenshot, sync
 * time, power off, push Wi-Fi, apply a saved profile, installed apps with
 * launch/lock/remove, kiosk status.
 *
 * Design intent: the user shouldn't have to bounce between Class Mode → Setup
 * → Wi-Fi → Apps to do per-headset things. They click the card, get a panel,
 * everything is right there. Other pages (Class Mode, Profiles, Apps) become
 * BULK operations across the fleet. This panel is per-device.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Battery,
  BatteryCharging,
  Cable,
  Camera,
  Clock,
  HardDrive,
  HelpCircle,
  Loader2,
  Lock,
  Pencil,
  Play,
  Power,
  Rocket,
  RotateCcw,
  Square,
  Trash2,
  Unlock,
  Wifi,
} from "lucide-react";
import { api } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDeviceInfo } from "@/hooks/useDevices";
import { formatBytes } from "@/lib/utils";
import type { CatalogApp, Device, WifiSecurity } from "@/types";

interface Props {
  serial: string | null;
  onOpenChange: (open: boolean) => void;
}

export function HeadsetPanel({ serial, onOpenChange }: Props) {
  const open = serial != null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {serial && <PanelBody serial={serial} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function PanelBody({ serial, onClose }: { serial: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: device } = useDeviceInfo(serial);
  const apps = useQuery({
    queryKey: ["apps", serial],
    queryFn: () => api.listApps(serial),
  });
  const catalog = useQuery({
    queryKey: ["catalog_cached"],
    queryFn: api.catalogGetCached,
    staleTime: Infinity,
  });
  const kiosk = useQuery({
    queryKey: ["kiosk", serial],
    queryFn: () => api.currentKiosk(serial),
    refetchInterval: 8000,
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: api.profileList,
  });
  const [busy, setBusy] = useState<string | null>(null);

  // Identity
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Wi-Fi push form
  const [ssid, setSsid] = useState("");
  const [psk, setPsk] = useState("");
  const [security, setSecurity] = useState<WifiSecurity>("wpa2psk");

  // Profile picker
  const [pickedProfileId, setPickedProfileId] = useState<string>("");

  function friendly(pkg: string | null | undefined): string | null {
    if (!pkg) return null;
    return (
      (catalog.data?.apps ?? []).find((a: CatalogApp) => a.package === pkg)?.name ??
      pkg
    );
  }

  async function run<T>(label: string, fn: () => Promise<T>, success?: string) {
    setBusy(label);
    try {
      await fn();
      toast.success(success ?? `${label} complete`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  async function applyPickedProfile() {
    if (!pickedProfileId) {
      toast.error("Pick a profile first");
      return;
    }
    setBusy("Apply profile");
    try {
      await api.profileApply(serial, pickedProfileId);
      toast.success("Profile applied — see Profiles page for step-by-step log");
      qc.invalidateQueries({ queryKey: ["apps", serial] });
      qc.invalidateQueries({ queryKey: ["kiosk", serial] });
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Apply failed");
    } finally {
      setBusy(null);
    }
  }

  async function pushWifi() {
    if (!ssid.trim()) {
      toast.error("Enter a network name (SSID)");
      return;
    }
    await run(
      "Push Wi-Fi",
      () =>
        api.provisionWifi(serial, {
          ssid: ssid.trim(),
          psk: psk || null,
          security,
          auto_connect: true,
        }),
      `Wi-Fi credentials pushed to headset`
    );
    setSsid("");
    setPsk("");
  }

  async function clearKiosk() {
    await run("Unlock", () => api.clearKiosk(serial), "Class Mode lock cleared");
    qc.invalidateQueries({ queryKey: ["kiosk", serial] });
  }

  return (
    <>
      <DialogHeader className="px-6 pt-6 pb-3 border-b border-border">
        <DialogTitle className="flex items-center gap-3 text-xl">
          <span>{device?.model ?? "Headset"}</span>
          <span className="text-sm font-mono text-muted-foreground">
            {serial.length > 8 ? serial.slice(-6) : serial}
          </span>
          {device?.connection_type === "wireless" ? (
            <Badge variant="outline" className="gap-1">
              <Wifi className="h-3 w-3" />
              Wireless
            </Badge>
          ) : device?.connection_type === "usb" ? (
            <Badge variant="outline" className="gap-1">
              <Cable className="h-3 w-3" />
              USB
            </Badge>
          ) : null}
        </DialogTitle>
        <DialogDescription>
          Everything for this one headset, in one place. Bulk operations across the
          fleet are in Class Mode and Profiles.
        </DialogDescription>
      </DialogHeader>

      <div className="px-6 py-5 space-y-5">
        {/* Status strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile
            label="Battery"
            value={device?.battery_pct != null ? `${device.battery_pct}%` : "—"}
            icon={device?.battery_charging ? BatteryCharging : Battery}
            tone={
              device?.battery_pct == null
                ? "neutral"
                : device.battery_pct < 20 && !device.battery_charging
                ? "warn"
                : "good"
            }
          />
          <StatTile
            label="Storage free"
            value={
              device?.storage_free != null ? formatBytes(device.storage_free) : "—"
            }
            icon={HardDrive}
            tone="neutral"
          />
          <StatTile
            label="Connection"
            value={
              device?.connection_type === "wireless"
                ? "Wi-Fi"
                : device?.connection_type === "usb"
                ? "USB cable"
                : "—"
            }
            icon={device?.connection_type === "wireless" ? Wifi : Cable}
            tone={device?.state === "device" ? "good" : "warn"}
          />
          <StatTile
            label="Class lock"
            value={kiosk.data ? friendly(kiosk.data) ?? "Locked" : "Unlocked"}
            icon={Lock}
            tone={kiosk.data ? "good" : "neutral"}
          />
        </div>

        {/* Identity row */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                Display name
              </Label>
              <div className="font-medium truncate">
                {device?.model ?? "Quest"}
              </div>
              <div className="text-xs font-mono text-muted-foreground truncate">
                {serial}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setRenameValue(device?.model ?? "");
                setRenameOpen((o) => !o);
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Rename
            </Button>
          </CardContent>
          {renameOpen && (
            <CardContent className="p-4 pt-0 flex gap-2">
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Library #3"
                maxLength={64}
              />
              <Button
                disabled={!renameValue.trim() || busy != null}
                onClick={async () => {
                  await run(
                    "Rename",
                    () => api.headsetRename(serial, renameValue.trim()),
                    `Renamed to "${renameValue.trim()}"`
                  );
                  setRenameOpen(false);
                }}
              >
                Save
              </Button>
              <Button variant="ghost" onClick={() => setRenameOpen(false)}>
                Cancel
              </Button>
            </CardContent>
          )}
        </Card>

        {/* Class Mode lock — surfaced at top because it's the most common
            class-period action a teacher does on a single headset. */}
        {kiosk.data && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4 flex items-center justify-between gap-3">
              <div>
                <div className="font-medium flex items-center gap-2">
                  <Lock className="h-4 w-4 text-emerald-400" />
                  Class-locked to {friendly(kiosk.data) ?? kiosk.data}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Student can't exit this app until you unlock.
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={clearKiosk}
                disabled={busy != null}
              >
                <Unlock className="h-3.5 w-3.5 mr-1.5" />
                End class
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick actions */}
        <Card>
          <CardContent className="p-4">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
              Quick actions
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <ActionButton
                icon={Camera}
                label="Screenshot"
                busy={busy === "Screenshot"}
                onClick={() =>
                  run(
                    "Screenshot",
                    () => api.headsetScreenshot(serial),
                    "Saved to Documents/MidWest-VR-Screenshots/"
                  )
                }
              />
              <ActionButton
                icon={Clock}
                label="Sync time"
                busy={busy === "Sync time"}
                onClick={() =>
                  run("Sync time", () => api.headsetSyncTime(serial))
                }
              />
              <ActionButton
                icon={RotateCcw}
                label="Restart"
                busy={busy === "Restart"}
                onClick={() => run("Restart", () => api.headsetReboot(serial))}
              />
              <ActionButton
                icon={Power}
                label="Power off"
                busy={busy === "Power off"}
                onClick={() => run("Power off", () => api.headsetPowerOff(serial))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Apply profile */}
        {(profiles.data?.length ?? 0) > 0 && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground block">
                Apply a saved profile
              </Label>
              <div className="flex gap-2">
                <select
                  className="flex-1 bg-background border border-border rounded-md px-2 py-2 text-sm"
                  value={pickedProfileId}
                  onChange={(e) => setPickedProfileId(e.target.value)}
                >
                  <option value="">— Pick a profile —</option>
                  {(profiles.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  onClick={applyPickedProfile}
                  disabled={!pickedProfileId || busy != null}
                >
                  {busy === "Apply profile" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4 mr-2" />
                  )}
                  Apply
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Runs rename → Wi-Fi → installs → removes → launcher → kiosk in
                order. Open the Profiles page to watch step-by-step progress.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Push Wi-Fi */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground block">
              Push Wi-Fi credentials
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input
                placeholder="Network name (SSID)"
                value={ssid}
                onChange={(e) => setSsid(e.target.value)}
              />
              <Input
                type="password"
                placeholder="Password (leave blank for open)"
                value={psk}
                onChange={(e) => setPsk(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                className="bg-background border border-border rounded-md px-2 py-2 text-sm flex-1"
                value={security}
                onChange={(e) => setSecurity(e.target.value as WifiSecurity)}
              >
                <option value="wpa2psk">WPA2-Personal (most networks)</option>
                <option value="open">Open / no password</option>
                <option value="wpa2enterprise">WPA2-Enterprise (rare)</option>
              </select>
              <Button
                onClick={pushWifi}
                disabled={!ssid.trim() || busy != null}
              >
                {busy === "Push Wi-Fi" ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Wifi className="h-4 w-4 mr-2" />
                )}
                Push
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Installed apps */}
        <Card>
          <CardContent className="p-4">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground mb-2 block">
              Installed apps ({apps.data?.length ?? 0})
            </Label>
            {apps.isLoading ? (
              <div className="text-sm text-muted-foreground py-2 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : (apps.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-md">
                No third-party apps installed yet. Browse Catalog or Apply a
                profile to install some.
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {(apps.data ?? []).map((a) => {
                  const cat = (catalog.data?.apps ?? []).find(
                    (c: CatalogApp) => c.package === a.package
                  );
                  const name = cat?.name ?? a.package;
                  const isLocked = kiosk.data === a.package;
                  return (
                    <div
                      key={a.package}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent"
                    >
                      <div className="w-8 h-8 rounded bg-muted shrink-0 overflow-hidden">
                        {cat?.thumbnail_url ? (
                          <img
                            src={cat.thumbnail_url}
                            alt={name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <HelpCircle className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{name}</div>
                        <div className="text-[11px] font-mono text-muted-foreground truncate">
                          {a.package}
                        </div>
                      </div>
                      {isLocked && (
                        <Badge variant="success" className="text-[10px]">
                          Locked
                        </Badge>
                      )}
                      <div className="flex items-center gap-0.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          title="Launch on headset"
                          onClick={() =>
                            run(
                              "Launch",
                              () => api.launchApp(serial, a.package),
                              `Launching ${name}`
                            )
                          }
                        >
                          <Play className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          title="Force stop"
                          onClick={() =>
                            run("Force stop", () => api.forceStop(serial, a.package))
                          }
                        >
                          <Square className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          title="Lock this headset to this app (Class Mode)"
                          onClick={() =>
                            run(
                              "Lock",
                              () => api.setKiosk(serial, a.package),
                              `Locked to ${name}`
                            )
                          }
                        >
                          <Lock className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-destructive hover:bg-destructive/10"
                          title="Remove from headset"
                          onClick={() => {
                            if (
                              confirm(`Uninstall ${name} from this headset?`)
                            ) {
                              run(
                                "Uninstall",
                                () => api.uninstallPkg(serial, a.package),
                                `Removed ${name}`
                              ).then(() =>
                                qc.invalidateQueries({ queryKey: ["apps", serial] })
                              );
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Destructive actions tucked at the bottom */}
        <details className="group">
          <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Danger zone
          </summary>
          <Card className="mt-3 border-destructive/30">
            <CardContent className="p-4">
              <div className="font-medium mb-1">Erase headset for next student</div>
              <p className="text-sm text-muted-foreground mb-3">
                Wipes everything: Meta account, apps, settings, save data. The
                headset boots up like new and asks to be paired again. Cannot be
                undone.
              </p>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy != null}
                onClick={() => {
                  if (
                    confirm(
                      `Factory-reset this headset? This wipes EVERYTHING and cannot be undone.`
                    )
                  ) {
                    run(
                      "Factory reset",
                      () => api.headsetFactoryReset(serial),
                      "Headset is wiping itself — it'll reboot to the welcome screen."
                    ).then(() => onClose());
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Erase headset
              </Button>
            </CardContent>
          </Card>
        </details>
      </div>
    </>
  );
}

interface StatTileProps {
  label: string;
  value: string | null;
  icon: React.ComponentType<{ className?: string }>;
  tone: "good" | "warn" | "neutral";
}

function StatTile({ label, value, icon: Icon, tone }: StatTileProps) {
  const toneClass =
    tone === "good"
      ? "text-emerald-400 bg-emerald-500/10"
      : tone === "warn"
      ? "text-amber-400 bg-amber-500/10"
      : "text-muted-foreground bg-muted";
  return (
    <div className="rounded-md border border-border p-3 flex items-center gap-3">
      <div
        className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${toneClass}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold truncate">{value ?? "—"}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  busy: boolean;
  onClick: () => void;
}

function ActionButton({ icon: Icon, label, busy, onClick }: ActionButtonProps) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={busy}
      className="h-auto py-3 flex flex-col gap-1.5"
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Icon className="h-4 w-4" />
      )}
      <span className="text-xs">{label}</span>
    </Button>
  );
}

// Re-export Device type so callers don't have to import it separately.
export type { Device };
