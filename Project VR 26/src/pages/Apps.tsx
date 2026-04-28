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
  Boxes,
  Download,
  HelpCircle,
  Loader2,
  Lock,
  Play,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { api, onInstallProgress } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices } from "@/hooks/useDevices";
import { ConfirmAction, type ConfirmTarget } from "@/components/ConfirmAction";
import type { CatalogApp, InstalledApp } from "@/types";

export function Apps() {
  const { data: devices } = useDevices();
  const onlineDevices = (devices ?? []).filter((d) => d.state === "device");
  const [serial, setSerial] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRemove, setConfirmRemove] = useState<{
    targets: ConfirmTarget[];
    packages: string[];
  } | null>(null);
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

  // Pull catalog so we can decorate installed apps with name + thumbnail.
  const catalog = useQuery({
    queryKey: ["catalog_cached"],
    queryFn: api.catalogGetCached,
    staleTime: Infinity,
  });

  const catalogByPackage = useMemo(() => {
    const m = new Map<string, CatalogApp>();
    for (const a of catalog.data?.apps ?? []) {
      if (a.package) m.set(a.package, a);
    }
    return m;
  }, [catalog.data]);

  const decoratedApps = useMemo(() => {
    return (apps.data ?? []).map((app) => {
      const cat = catalogByPackage.get(app.package);
      return {
        ...app,
        displayName: cat?.name ?? app.package,
        thumbnail: cat?.thumbnail_url ?? null,
        publisher: cat?.publisher ?? null,
        catalog_known: !!cat,
      };
    });
  }, [apps.data, catalogByPackage]);

  const filtered = useMemo(() => {
    if (!filter) return decoratedApps;
    const f = filter.toLowerCase();
    return decoratedApps.filter(
      (a) =>
        a.package.toLowerCase().includes(f) ||
        a.displayName.toLowerCase().includes(f) ||
        (a.publisher ?? "").toLowerCase().includes(f)
    );
  }, [decoratedApps, filter]);

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

  function toggleSelect(pkg: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function selectAll() {
    setSelected(new Set(filtered.map((a) => a.package)));
  }

  function openRemoveConfirmFor(packages: string[]) {
    const targets: ConfirmTarget[] = packages.map((p) => {
      const dec = decoratedApps.find((a) => a.package === p);
      return {
        name: dec?.displayName ?? p,
        thumbnail: dec?.thumbnail ?? null,
        subtitle: p,
      };
    });
    setConfirmRemove({ targets, packages });
  }

  async function performRemove() {
    if (!serial || !confirmRemove) return;
    const { packages } = confirmRemove;
    let successes = 0;
    let failures = 0;
    for (const pkg of packages) {
      try {
        await api.uninstallPkg(serial, pkg);
        successes++;
      } catch {
        failures++;
      }
    }
    qc.invalidateQueries({ queryKey: ["apps", serial] });
    clearSelection();
    if (failures === 0) {
      toast.success(`Removed ${successes} app${successes === 1 ? "" : "s"}`);
    } else {
      toast.warning(`Removed ${successes}, ${failures} failed`);
    }
  }

  const someSelected = selected.size > 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Apps"
        subtitle="What's currently installed on the selected headset"
        right={
          <div className="flex items-center gap-2">
            {someSelected && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => openRemoveConfirmFor(Array.from(selected))}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove {selected.size} selected
              </Button>
            )}
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
              Install APK from file…
            </Button>
          </div>
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
          <div className="text-xs text-muted-foreground space-y-1.5">
            <div className="uppercase tracking-wider">Tips</div>
            <div>
              • <strong>Sideload from Discover</strong> for catalog-known apps
              with thumbnails and verified hashes.
            </div>
            <div>
              • <strong>Install APK from file</strong> for one-off / custom
              builds you have locally.
            </div>
            <div>
              • Tap any card to select multiple apps for a bulk remove.
            </div>
          </div>
        </aside>
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter apps…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            {filtered.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={selectAll}
                  disabled={selected.size === filtered.length}
                >
                  Select all
                </Button>
                {someSelected && (
                  <Button variant="ghost" size="sm" onClick={clearSelection}>
                    Clear ({selected.size})
                  </Button>
                )}
              </>
            )}
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
              No third-party apps installed yet. Use the Discover tab or Install
              APK from file.
            </EmptyText>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {filtered.map((a) => (
                <AppCard
                  key={a.package}
                  app={a}
                  selected={selected.has(a.package)}
                  onToggleSelect={() => toggleSelect(a.package)}
                  onLaunch={async () => {
                    try {
                      await api.launchApp(serial, a.package);
                      toast.success(`Launching ${a.displayName} on headset`);
                    } catch (e: unknown) {
                      toast.error(
                        (e as { message?: string })?.message ?? "Launch failed"
                      );
                    }
                  }}
                  onForceStop={async () => {
                    try {
                      await api.forceStop(serial, a.package);
                      toast.success(`Stopped ${a.displayName}`);
                    } catch (e: unknown) {
                      toast.error(
                        (e as { message?: string })?.message ?? "Stop failed"
                      );
                    }
                  }}
                  onAskRemove={() => openRemoveConfirmFor([a.package])}
                  onLockClass={async () => {
                    try {
                      await api.setKiosk(serial, a.package);
                      toast.success(
                        `${a.displayName} locked on this headset. Open Class Mode to lock more.`
                      );
                    } catch (e: unknown) {
                      toast.error(
                        (e as { message?: string })?.message ??
                          "Lock failed. Push the MidWest-VR Launcher first."
                      );
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmAction
        open={!!confirmRemove}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
        action="uninstall"
        targets={confirmRemove?.targets ?? []}
        headsetCount={1}
        warning={
          confirmRemove && confirmRemove.targets.length > 5
            ? "You're removing a large number of apps. Double-check the list above."
            : null
        }
        onConfirm={performRemove}
      />
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

interface AppCardProps {
  app: {
    package: string;
    displayName: string;
    thumbnail: string | null;
    publisher: string | null;
    catalog_known: boolean;
  } & InstalledApp;
  selected: boolean;
  onToggleSelect: () => void;
  onLaunch: () => Promise<void>;
  onForceStop: () => Promise<void>;
  onAskRemove: () => void;
  onLockClass: () => Promise<void>;
}

function AppCard({
  app,
  selected,
  onToggleSelect,
  onLaunch,
  onForceStop,
  onAskRemove,
  onLockClass,
}: AppCardProps) {
  return (
    <Card
      className={`overflow-hidden transition-all ${
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "hover:border-primary/40"
      }`}
    >
      <button
        type="button"
        onClick={onToggleSelect}
        className="w-full aspect-video bg-muted block relative group"
        aria-label={`Select ${app.displayName}`}
      >
        {app.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.thumbnail}
            alt={app.displayName}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <HelpCircle className="h-8 w-8 text-muted-foreground/50" />
          </div>
        )}
        <div
          className={`absolute top-2 left-2 h-5 w-5 rounded border-2 transition-colors ${
            selected
              ? "bg-primary border-primary"
              : "bg-background/70 border-border group-hover:border-primary"
          }`}
        >
          {selected && (
            <svg
              viewBox="0 0 16 16"
              className="w-full h-full text-primary-foreground"
              fill="currentColor"
            >
              <path d="M3 8l3 3 7-7-1-1-6 6-2-2z" />
            </svg>
          )}
        </div>
        {!app.catalog_known && (
          <Badge
            variant="outline"
            className="absolute top-2 right-2 bg-background/80 text-[10px]"
          >
            Custom
          </Badge>
        )}
      </button>
      <CardContent className="p-3 space-y-2">
        <div>
          <div className="font-medium truncate text-sm" title={app.displayName}>
            {app.displayName}
          </div>
          <div
            className="text-[11px] text-muted-foreground truncate font-mono"
            title={app.package}
          >
            {app.package}
          </div>
        </div>
        {app.publisher && (
          <div className="text-xs text-muted-foreground truncate">
            {app.publisher}
          </div>
        )}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-7 px-2 text-xs"
            onClick={onLaunch}
          >
            <Play className="h-3 w-3 mr-1" />
            Launch
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onLockClass}
            title="Lock this headset to this app (Class Mode)"
          >
            <Lock className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onForceStop}
            title="Force stop"
          >
            <Square className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
            onClick={onAskRemove}
            title="Remove from headset"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
