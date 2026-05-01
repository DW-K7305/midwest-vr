/**
 * Class Mode — the teacher's "lock my fleet to one app" page.
 *
 * Why this page replaces the old "Kiosk" page:
 *
 *   - The previous version only stashed a setting key and launched the app —
 *     students could press the home button and walk right out. Real lock was
 *     missing.
 *   - Now the lock works by pushing a `kiosk_app` field into our launcher's
 *     config and setting our launcher as system home. When a student presses
 *     home, our launcher runs, sees `kiosk_app`, and re-launches the app
 *     immediately. They cannot escape until an admin clears the field here.
 *   - The page is rebuilt for non-technical users: a single "Lock all
 *     selected headsets to this app" workflow, a global banner showing what's
 *     currently locked, and a giant "End class — unlock everything" button.
 *
 * Pre-requisite: each headset must have the MidWest-VR Launcher APK installed
 * (Phase 27/28). We probe for it here and offer a 1-click push if missing.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  CheckCircle2,
  GraduationCap,
  HelpCircle,
  Loader2,
  Lock,
  Unlock,
  Wifi,
  Cable,
} from "lucide-react";
import { api } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices } from "@/hooks/useDevices";
import type { CatalogApp } from "@/types";

export function ClassMode() {
  const { data: devices } = useDevices();
  const onlineDevices = useMemo(
    () => (devices ?? []).filter((d) => d.state === "device"),
    [devices]
  );
  const qc = useQueryClient();

  // Selected headsets to apply the action to. Default = "all online".
  const [selectedSerials, setSelectedSerials] = useState<Set<string>>(new Set());
  const [pickedAppPkg, setPickedAppPkg] = useState<string | null>(null);
  const [busy, setBusy] = useState<"locking" | "unlocking" | null>(null);

  // First time we see online devices, pre-select all of them.
  useEffect(() => {
    if (selectedSerials.size === 0 && onlineDevices.length > 0) {
      setSelectedSerials(new Set(onlineDevices.map((d) => d.serial)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineDevices.length]);

  // Available apps to lock to: union of installed apps across the selected
  // online headsets. We poll the first selected headset for the menu.
  const primarySerial = useMemo(() => {
    const arr = Array.from(selectedSerials);
    return (
      arr.find((s) => onlineDevices.some((d) => d.serial === s)) ??
      onlineDevices[0]?.serial ??
      null
    );
  }, [selectedSerials, onlineDevices]);

  const installedApps = useQuery({
    queryKey: ["apps", primarySerial],
    queryFn: () => api.listApps(primarySerial!),
    enabled: !!primarySerial,
  });

  // Pull catalog so we can show friendly names + thumbnails for known apps.
  const catalog = useQuery({
    queryKey: ["catalog_cached"],
    queryFn: api.catalogGetCached,
    staleTime: Infinity,
  });
  const catalogByPackage = useMemo(() => {
    const m = new Map<string, CatalogApp>();
    for (const a of catalog.data?.apps ?? []) if (a.package) m.set(a.package, a);
    return m;
  }, [catalog.data]);

  // Currently-locked status per headset (single round-trip per headset).
  const lockStatus = useQuery({
    queryKey: ["kiosk_status_all", onlineDevices.map((d) => d.serial).sort().join("|")],
    queryFn: async () => {
      const out = new Map<string, string | null>();
      for (const d of onlineDevices) {
        try {
          out.set(d.serial, await api.currentKiosk(d.serial));
        } catch {
          out.set(d.serial, null);
        }
      }
      return out;
    },
    enabled: onlineDevices.length > 0,
    refetchInterval: 8000,
  });

  // Launcher-installed status per headset.
  const launcherStatus = useQuery({
    queryKey: ["launcher_installed_all", onlineDevices.map((d) => d.serial).sort().join("|")],
    queryFn: async () => {
      const out = new Map<string, boolean>();
      for (const d of onlineDevices) {
        try {
          out.set(d.serial, await api.launcherIsInstalled(d.serial));
        } catch {
          out.set(d.serial, false);
        }
      }
      return out;
    },
    enabled: onlineDevices.length > 0,
    refetchInterval: 30000,
  });

  const headsetsNeedingLauncher = useMemo(() => {
    if (!launcherStatus.data) return [] as string[];
    return Array.from(selectedSerials).filter(
      (s) => launcherStatus.data!.get(s) === false
    );
  }, [launcherStatus.data, selectedSerials]);

  const lockedCount = useMemo(() => {
    if (!lockStatus.data) return 0;
    let n = 0;
    for (const v of lockStatus.data.values()) if (v) n++;
    return n;
  }, [lockStatus.data]);

  function toggleSerial(serial: string) {
    setSelectedSerials((prev) => {
      const next = new Set(prev);
      if (next.has(serial)) next.delete(serial);
      else next.add(serial);
      return next;
    });
  }
  function selectAll() {
    setSelectedSerials(new Set(onlineDevices.map((d) => d.serial)));
  }
  function selectNone() {
    setSelectedSerials(new Set());
  }

  async function handleLockAll() {
    if (!pickedAppPkg) {
      toast.error("Pick an app first.");
      return;
    }
    if (selectedSerials.size === 0) {
      toast.error("Pick at least one headset.");
      return;
    }
    setBusy("locking");
    try {
      const results = await api.setKioskMany(
        Array.from(selectedSerials),
        pickedAppPkg
      );
      const ok = results.filter((r) => r.ok).length;
      const fail = results.filter((r) => !r.ok);
      if (fail.length === 0) {
        toast.success(`Locked ${ok} headset${ok === 1 ? "" : "s"}.`);
      } else {
        toast.warning(
          `Locked ${ok} of ${results.length}. ${fail.length} failed: ${fail
            .map((f) => `${f.serial.slice(-4)}: ${f.error ?? "unknown error"}`)
            .join("; ")}`
        );
      }
      qc.invalidateQueries({ queryKey: ["kiosk_status_all"] });
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Lock failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleUnlockAll() {
    if (selectedSerials.size === 0) {
      toast.error("Pick at least one headset.");
      return;
    }
    setBusy("unlocking");
    try {
      const results = await api.clearKioskMany(Array.from(selectedSerials));
      const ok = results.filter((r) => r.ok).length;
      const fail = results.filter((r) => !r.ok);
      if (fail.length === 0) {
        toast.success(`Unlocked ${ok} headset${ok === 1 ? "" : "s"}.`);
      } else {
        toast.warning(`Unlocked ${ok} of ${results.length}.`);
      }
      qc.invalidateQueries({ queryKey: ["kiosk_status_all"] });
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Unlock failed");
    } finally {
      setBusy(null);
    }
  }

  async function handlePushLauncher() {
    if (headsetsNeedingLauncher.length === 0) {
      toast.success("Launcher already installed everywhere.");
      return;
    }
    setBusy("locking"); // reuse spinner
    try {
      // Phase 43: use the launcher APK that's bundled inside this .app at
      // build time. No file picker, no manual APK path. If the .app was
      // built without a bundled APK (CI placeholder case), the backend
      // returns a clear error explaining how to fix it.
      await api.launcherPushBundled(
        headsetsNeedingLauncher,
        {
          school_name: "",
          greeting: "",
          include_system: false,
          allowlist: [],
        },
        true // set as home
      );
      toast.success(
        `Launcher installed on ${headsetsNeedingLauncher.length} headset${
          headsetsNeedingLauncher.length === 1 ? "" : "s"
        }. You can now lock them.`
      );
      qc.invalidateQueries({ queryKey: ["launcher_installed_all"] });
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Push failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Class Mode"
        subtitle="Lock every headset in your class to one app — students can't escape until you unlock"
        right={
          lockedCount > 0 ? (
            <Badge variant="success" className="gap-1.5">
              <Lock className="h-3 w-3" />
              {lockedCount} headset{lockedCount === 1 ? "" : "s"} locked
            </Badge>
          ) : null
        }
      />

      {/* Active-class banner */}
      {lockedCount > 0 && (
        <div className="border-b border-emerald-500/30 bg-emerald-500/10 px-6 py-3 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          <div className="flex-1 text-sm">
            <strong>Class is in session.</strong> {lockedCount} headset
            {lockedCount === 1 ? " is" : "s are"} locked to a single app. Press
            "End class" when you're done so students can use the headsets
            normally again.
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleUnlockAll}
            disabled={busy !== null}
            className="border-emerald-500/40 hover:bg-emerald-500/10"
          >
            {busy === "unlocking" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Unlock className="h-4 w-4 mr-2" />
            )}
            End class — unlock {selectedSerials.size > 0 ? selectedSerials.size : "all"}
          </Button>
        </div>
      )}

      {/* Launcher-needs-install banner */}
      {headsetsNeedingLauncher.length > 0 && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-3 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
          <div className="flex-1 text-sm">
            <strong>One-time setup needed.</strong>{" "}
            {headsetsNeedingLauncher.length} of your selected headsets don't
            have the MidWest-VR Launcher installed yet — Class Mode needs it to
            actually lock the headset. Push it now (you only do this once per
            headset).
          </div>
          <Button size="sm" onClick={handlePushLauncher} disabled={busy !== null}>
            Push Launcher to {headsetsNeedingLauncher.length}
          </Button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT: headset multi-select */}
        <aside className="w-80 shrink-0 border-r border-border p-4 space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Headsets to apply to
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectAll}>
                All
              </Button>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectNone}>
                None
              </Button>
            </div>
          </div>
          {onlineDevices.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No headsets online. Plug one in via USB or wait for wireless
              reconnect.
            </div>
          ) : (
            onlineDevices.map((d) => {
              const selected = selectedSerials.has(d.serial);
              const lockedTo = lockStatus.data?.get(d.serial) ?? null;
              const launcherOk = launcherStatus.data?.get(d.serial) ?? false;
              const friendly = catalogByPackage.get(lockedTo ?? "")?.name;
              return (
                <button
                  key={d.serial}
                  type="button"
                  onClick={() => toggleSerial(d.serial)}
                  className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                        selected
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {selected && (
                        <svg viewBox="0 0 16 16" className="w-3 h-3 text-primary-foreground" fill="currentColor">
                          <path d="M3 8l3 3 7-7-1-1-6 6-2-2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {d.model ?? "Quest"}{" "}
                        <span className="text-muted-foreground font-normal">
                          ({d.serial.slice(-4)})
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        {d.connection_type === "wireless" ? (
                          <Wifi className="h-3 w-3" />
                        ) : (
                          <Cable className="h-3 w-3" />
                        )}
                        {d.connection_type === "wireless" ? "Wireless" : "USB"}
                        {d.battery_pct != null && (
                          <span>• {d.battery_pct}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 ml-6 flex items-center gap-2 flex-wrap">
                    {!launcherOk && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">
                        Launcher missing
                      </Badge>
                    )}
                    {lockedTo ? (
                      <Badge variant="success" className="text-[10px] gap-1">
                        <Lock className="h-2.5 w-2.5" />
                        Locked: {friendly ?? lockedTo}
                      </Badge>
                    ) : (
                      launcherOk && (
                        <Badge variant="outline" className="text-[10px]">
                          Unlocked
                        </Badge>
                      )
                    )}
                  </div>
                </button>
              );
            })
          )}
        </aside>

        {/* RIGHT: app picker + giant action button */}
        <div className="flex-1 p-6 overflow-y-auto">
          <Card className="mb-4">
            <CardContent className="p-4 flex items-start gap-3">
              <GraduationCap className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm space-y-1.5">
                <div>
                  <strong>How this works:</strong> Pick the one app students
                  should use this period (e.g. "Beat Saber" or your science
                  lesson). Click <em>"Lock to this app"</em>. Every selected
                  headset is forced into that app and re-routes there if the
                  student presses the home button.
                </div>
                <div className="text-muted-foreground">
                  When you're done, press <em>End class — unlock</em> in the
                  green banner up top.
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">
              Choose the app for this class period
            </div>
            <div className="text-xs text-muted-foreground">
              Showing apps installed on{" "}
              {primarySerial?.slice(-4) ?? "—"}
            </div>
          </div>

          {!primarySerial ? (
            <Empty>Pick a headset on the left first.</Empty>
          ) : installedApps.isLoading ? (
            <Empty>
              <Loader2 className="h-4 w-4 inline mr-2 animate-spin" />
              Loading apps…
            </Empty>
          ) : (installedApps.data ?? []).length === 0 ? (
            <Empty>
              No apps installed on this headset yet. Use the Discover or Apps
              page to install one first.
            </Empty>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {(installedApps.data ?? [])
                  .map((a) => ({
                    pkg: a.package,
                    name:
                      catalogByPackage.get(a.package)?.name ?? a.package,
                    thumb: catalogByPackage.get(a.package)?.thumbnail_url ?? null,
                    publisher: catalogByPackage.get(a.package)?.publisher ?? null,
                  }))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((a) => (
                    <button
                      key={a.pkg}
                      type="button"
                      onClick={() => setPickedAppPkg(a.pkg)}
                      className={`text-left rounded-lg border overflow-hidden transition-all ${
                        pickedAppPkg === a.pkg
                          ? "border-primary ring-2 ring-primary/30"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="aspect-video bg-muted relative">
                        {a.thumb ? (
                          <img
                            src={a.thumb}
                            alt={a.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <HelpCircle className="h-8 w-8 text-muted-foreground/40" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <div className="font-medium truncate text-sm">
                          {a.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate font-mono">
                          {a.pkg}
                        </div>
                      </div>
                    </button>
                  ))}
              </div>

              {/* Giant action button — sticky-ish at the bottom of scroll */}
              <div className="sticky bottom-0 -mx-6 px-6 py-4 border-t border-border bg-background/95 backdrop-blur">
                <div className="flex items-center justify-between gap-3 max-w-3xl mx-auto">
                  <div className="text-sm">
                    {pickedAppPkg ? (
                      <>
                        Will lock <strong>{selectedSerials.size}</strong>{" "}
                        headset{selectedSerials.size === 1 ? "" : "s"} to{" "}
                        <strong>
                          {catalogByPackage.get(pickedAppPkg)?.name ?? pickedAppPkg}
                        </strong>
                        .
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Pick an app card above to enable the lock button.
                      </span>
                    )}
                  </div>
                  <Button
                    size="lg"
                    onClick={handleLockAll}
                    disabled={!pickedAppPkg || selectedSerials.size === 0 || busy !== null}
                    className="min-w-[180px]"
                  >
                    {busy === "locking" ? (
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    ) : (
                      <Lock className="h-5 w-5 mr-2" />
                    )}
                    Lock to this app
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-muted-foreground py-12 text-center border border-dashed border-border rounded-md">
      {children}
    </div>
  );
}
