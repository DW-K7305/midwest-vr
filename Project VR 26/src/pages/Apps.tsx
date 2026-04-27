import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "@/components/PageHeader";
import { DevicePicker } from "@/components/DevicePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Boxes,
  Download,
  Play,
  Square,
  Trash2,
  Search,
  Loader2,
} from "lucide-react";
import { api, onInstallProgress } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices } from "@/hooks/useDevices";

export function Apps() {
  const { data: devices } = useDevices();
  const onlineDevices = (devices ?? []).filter((d) => d.state === "device");
  const [serial, setSerial] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<{ pkg: string } | null>(
    null
  );
  const qc = useQueryClient();

  // Auto-pick the first online device.
  useEffect(() => {
    if (!serial && onlineDevices.length) setSerial(onlineDevices[0].serial);
  }, [onlineDevices, serial]);

  const apps = useQuery({
    queryKey: ["apps", serial],
    queryFn: () => api.listApps(serial!),
    enabled: !!serial,
  });

  const filtered = useMemo(() => {
    const list = apps.data ?? [];
    if (!filter) return list;
    const f = filter.toLowerCase();
    return list.filter(
      (a) =>
        a.package.toLowerCase().includes(f) ||
        (a.label ?? "").toLowerCase().includes(f)
    );
  }, [apps.data, filter]);

  // Subscribe to install progress events.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    onInstallProgress((e) => {
      setInstallLog((prev) => [...prev.slice(-19), e.line]);
    }).then((u) => (unlisten = u));
    return () => unlisten?.();
  }, []);

  async function handleInstall() {
    if (!serial) return;
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Android Package", extensions: ["apk"] }],
    });
    if (!picked || Array.isArray(picked)) return;
    setInstallLog([]);
    setInstalling(true);
    try {
      await api.installApk(serial, picked as string);
      toast.success("APK installed");
      qc.invalidateQueries({ queryKey: ["apps", serial] });
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? "Install failed";
      toast.error(msg);
    } finally {
      setInstalling(false);
    }
  }

  async function handleUninstall(pkg: string) {
    if (!serial) return;
    try {
      await api.uninstallPkg(serial, pkg);
      toast.success(`Uninstalled ${pkg}`);
      qc.invalidateQueries({ queryKey: ["apps", serial] });
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Uninstall failed");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Apps"
        subtitle="Sideload, launch, and uninstall apps on the selected headset"
        right={
          <Button
            onClick={handleInstall}
            disabled={!serial || installing}
            size="sm"
          >
            {installing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Install APK…
          </Button>
        }
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-border p-4 space-y-4">
          <DevicePicker selected={serial} onSelect={setSerial} />
          {installing && (
            <Card>
              <CardContent className="p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Install progress
                </div>
                <div className="font-mono text-[11px] leading-relaxed max-h-40 overflow-y-auto">
                  {installLog.map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="relative mb-3">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter packages…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          {!serial ? (
            <EmptyText>Select a headset to view its apps.</EmptyText>
          ) : apps.isLoading ? (
            <EmptyText>
              <Loader2 className="h-4 w-4 inline mr-2 animate-spin" />
              Loading apps…
            </EmptyText>
          ) : filtered.length === 0 ? (
            <EmptyText>
              <Boxes className="h-4 w-4 inline mr-2" />
              No third-party apps installed yet.
            </EmptyText>
          ) : (
            <div className="rounded-lg border border-border divide-y divide-border bg-card/30">
              {filtered.map((a) => (
                <AppRow
                  key={a.package}
                  pkg={a.package}
                  onLaunch={() => api.launchApp(serial, a.package)}
                  onForceStop={() => api.forceStop(serial, a.package)}
                  onAskRemove={() => setConfirmRemove({ pkg: a.package })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uninstall package?</DialogTitle>
            <DialogDescription>
              <span className="font-mono">{confirmRemove?.pkg}</span> will be
              removed from the selected headset. User data for the app is also
              wiped.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirmRemove) {
                  handleUninstall(confirmRemove.pkg);
                  setConfirmRemove(null);
                }
              }}
            >
              Uninstall
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-muted-foreground py-12 text-center">
      {children}
    </div>
  );
}

function AppRow({
  pkg,
  onLaunch,
  onForceStop,
  onAskRemove,
}: {
  pkg: string;
  onLaunch: () => Promise<void>;
  onForceStop: () => Promise<void>;
  onAskRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <div className="font-mono text-sm truncate">{pkg}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {pkg.startsWith("com.oculus.") ||
          pkg.startsWith("com.meta.") ? (
            <Badge variant="outline">First-party</Badge>
          ) : (
            <Badge variant="secondary">Sideloaded</Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onLaunch().catch((e) =>
              toast.error((e as { message?: string })?.message ?? "Launch failed")
            )
          }
        >
          <Play className="h-3.5 w-3.5 mr-1.5" /> Launch
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onForceStop().catch((e) =>
              toast.error((e as { message?: string })?.message ?? "Stop failed")
            )
          }
        >
          <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
        </Button>
        <Button variant="ghost" size="sm" onClick={onAskRemove}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5 text-destructive" />
          Remove
        </Button>
      </div>
    </div>
  );
}
