import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { SubNav, APPS_NAV } from "@/components/SubNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Compass,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  WifiOff,
} from "lucide-react";
import { api, onDiscoverEvent } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices, useSettings } from "@/hooks/useDevices";
import type { BatchEvent, CatalogApp } from "@/types";
import { cn, formatBytes } from "@/lib/utils";

type InstallStatus = "idle" | "downloading" | "installing" | "done" | "fail";
interface PerHeadsetState {
  status: InstallStatus;
  detail?: string;
}
type ProgressMap = Record<string, Record<string, PerHeadsetState>>; // appId → serial → state
type DownloadMap = Record<string, { downloaded: number; total: number; done: boolean }>;

export function Discover() {
  const qc = useQueryClient();
  const { data: settings } = useSettings();
  const { data: devices } = useDevices();
  const onlineDevices = (devices ?? []).filter((d) => d.state === "device");

  const cached = useQuery({
    queryKey: ["catalog_cached"],
    queryFn: api.catalogGetCached,
    staleTime: Infinity,
  });

  const refreshMut = async () => {
    try {
      const c = await api.catalogRefresh();
      qc.setQueryData(["catalog_cached"], c);
      toast.success(`Catalog refreshed — ${c.apps.length} apps available`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Refresh failed");
    }
  };

  // Auto-refresh once on first mount if catalog is online and we have nothing.
  useEffect(() => {
    if (settings?.online_catalog_enabled && !cached.data) {
      refreshMut();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.online_catalog_enabled]);

  const [filter, setFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogApp | null>(null);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [downloads, setDownloads] = useState<DownloadMap>({});

  const apps = cached.data?.apps ?? [];
  const subjects = useMemo(() => {
    const s = new Set<string>();
    for (const a of apps) for (const t of a.subjects) s.add(t);
    return Array.from(s).sort();
  }, [apps]);

  const filtered = useMemo(() => {
    const f = filter.toLowerCase();
    return apps.filter((a) => {
      if (subjectFilter && !a.subjects.includes(subjectFilter)) return false;
      if (!f) return true;
      return (
        a.name.toLowerCase().includes(f) ||
        a.publisher.toLowerCase().includes(f) ||
        a.short_desc.toLowerCase().includes(f) ||
        a.subjects.some((s) => s.toLowerCase().includes(f))
      );
    });
  }, [apps, filter, subjectFilter]);

  // Subscribe to backend install events.
  const unlistenRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    onDiscoverEvent((e) => handleEvent(e)).then((u) => (unlistenRef.current = u));
    return () => {
      unlistenRef.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleEvent(e: BatchEvent) {
    switch (e.type) {
      case "download_start":
        setDownloads((prev) => ({
          ...prev,
          [e.app_id]: { downloaded: 0, total: 0, done: false },
        }));
        break;
      case "download_progress":
        setDownloads((prev) => ({
          ...prev,
          [e.app_id]: { downloaded: e.downloaded, total: e.total, done: false },
        }));
        break;
      case "download_done":
        setDownloads((prev) => ({
          ...prev,
          [e.app_id]: {
            downloaded: prev[e.app_id]?.downloaded ?? 0,
            total: prev[e.app_id]?.total ?? 0,
            done: true,
          },
        }));
        break;
      case "headset_start":
        setProgress((prev) => withState(prev, e.app_id, e.serial, { status: "installing" }));
        break;
      case "headset_line":
        setProgress((prev) =>
          withState(prev, e.app_id, e.serial, { status: "installing", detail: e.line })
        );
        break;
      case "headset_done":
        setProgress((prev) => withState(prev, e.app_id, e.serial, { status: "done" }));
        break;
      case "headset_fail":
        setProgress((prev) =>
          withState(prev, e.app_id, e.serial, { status: "fail", detail: e.error })
        );
        break;
    }
  }

  async function installToAll(app: CatalogApp) {
    if (onlineDevices.length === 0) {
      toast.error("No online headsets to install on.");
      return;
    }
    if (app.source !== "sideload") {
      toast.warning(
        "This app is on the Quest Store — open it on the headset to install."
      );
      return;
    }
    const serials = onlineDevices.map((d) => d.serial);
    for (const s of serials) {
      setProgress((prev) => withState(prev, app.id, s, { status: "downloading" }));
    }
    try {
      await api.discoverInstall(app.id, serials);
      toast.success(`${app.name} dispatched to ${serials.length} headset${serials.length === 1 ? "" : "s"}`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Install failed");
    }
  }

  async function installRecommendedPack() {
    if (onlineDevices.length === 0) {
      toast.error("No online headsets to install on.");
      return;
    }
    const serials = onlineDevices.map((d) => d.serial);
    try {
      toast.info("Installing recommended pack — this may take several minutes.");
      await api.discoverInstallRecommendedPack(serials);
      toast.success("Recommended pack complete!");
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Pack install failed");
    }
  }

  // ---------- Render ----------

  if (!settings?.online_catalog_enabled) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader
          title="Browse Catalog"
          subtitle="Curated K-12 apps — verified safe, direct download, no Meta account needed"
        />
        <SubNav items={APPS_NAV} />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md">
            <CardContent className="p-6 text-center">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <WifiOff className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold mb-1">Online catalog is OFF</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Discover needs internet access to fetch the curated catalog. By
                default this is disabled — flip the switch in{" "}
                <strong>Settings → Online Catalog</strong> to opt in. The app
                only talks to a hardcoded allowlist of trusted hosts (GitHub,
                publisher CDNs). No telemetry, no accounts, no tracking.
              </p>
              <a
                href="/settings"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.hash = "/settings";
                }}
              >
                <Button variant="outline">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Review network policy in Settings
                </Button>
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Browse Catalog"
        subtitle={
          cached.data
            ? `${apps.length} curated K-12 apps • last updated ${cached.data.last_updated}`
            : "Curated K-12 Quest 2 apps — verified safe, install directly"
        }
        right={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={refreshMut}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh catalog
            </Button>
            <Button
              size="sm"
              onClick={installRecommendedPack}
              disabled={onlineDevices.length === 0 || apps.length === 0}
            >
              <Rocket className="h-4 w-4 mr-2" />
              Install Recommended Pack on All ({onlineDevices.length})
            </Button>
          </div>
        }
      />
      <SubNav items={APPS_NAV} />

      <div className="flex-1 overflow-y-auto">
        {/* Filter strip */}
        <div className="border-b border-border px-6 py-3 flex items-center gap-2 flex-wrap bg-card/30 sticky top-0 backdrop-blur z-10">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search apps, subjects, publishers…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <SubjectChip
              label="All"
              active={subjectFilter === null}
              onClick={() => setSubjectFilter(null)}
            />
            {subjects.map((s) => (
              <SubjectChip
                key={s}
                label={s}
                active={subjectFilter === s}
                onClick={() => setSubjectFilter(s)}
              />
            ))}
          </div>
        </div>

        {/* Empty / loading states */}
        {apps.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <Compass className="h-8 w-8 mx-auto mb-3 opacity-60" />
            {cached.isLoading ? "Loading catalog…" : "Catalog is empty — try Refresh."}
          </div>
        )}

        {/* Card grid */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
            {filtered.map((a) => (
              <CatalogCard
                key={a.id}
                app={a}
                onlineDeviceCount={onlineDevices.length}
                onOpenDetail={() => setDetail(a)}
                onInstallAll={() => installToAll(a)}
                progress={progress[a.id] ?? {}}
                download={downloads[a.id]}
              />
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {detail.name}
                  <Badge variant="outline">{detail.age_rating}</Badge>
                  {detail.recommended && (
                    <Badge variant="success">
                      <Sparkles className="h-3 w-3 mr-1 inline" />
                      Recommended
                    </Badge>
                  )}
                </DialogTitle>
                <DialogDescription>
                  by {detail.publisher} · {detail.license}
                </DialogDescription>
              </DialogHeader>

              {detail.thumbnail_url && (
                <div className="rounded-lg overflow-hidden bg-muted aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={detail.thumbnail_url}
                    alt={detail.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <p className="text-sm whitespace-pre-line text-muted-foreground leading-relaxed">
                {detail.long_desc}
              </p>

              <div className="flex flex-wrap gap-1.5">
                {detail.subjects.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
                {detail.grade_bands.map((g) => (
                  <Badge key={g} variant="outline">
                    {g}
                  </Badge>
                ))}
              </div>

              <DialogFooter className="flex sm:justify-between gap-2">
                <a
                  href={detail.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-muted-foreground inline-flex items-center hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  Publisher page
                </a>
                {detail.source === "sideload" && detail.apk_url ? (
                  <Button
                    onClick={() => {
                      setDetail(null);
                      installToAll(detail);
                    }}
                    disabled={onlineDevices.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Install on all online headsets ({onlineDevices.length})
                  </Button>
                ) : detail.source === "sideload" ? (
                  // Sideload flagged but no direct APK URL — link to publisher
                  // releases page so the user can download the APK manually
                  // and use Apps → Install APK from file. Honest UX instead
                  // of a broken Install button.
                  <Button
                    variant="outline"
                    onClick={() => window.open(detail.source_url, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Get APK from publisher
                  </Button>
                ) : (
                  <Button variant="outline" disabled>
                    Quest Store only — install from headset
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubjectChip({
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
      className={cn(
        "px-2.5 h-7 rounded-full text-xs border transition-colors",
        active
          ? "bg-primary/15 border-primary/40 text-foreground"
          : "border-border text-muted-foreground hover:bg-accent"
      )}
    >
      {label}
    </button>
  );
}

interface CatalogCardProps {
  app: CatalogApp;
  onlineDeviceCount: number;
  onOpenDetail: () => void;
  onInstallAll: () => void;
  progress: Record<string, PerHeadsetState>;
  download?: { downloaded: number; total: number; done: boolean };
}

function CatalogCard({
  app,
  onlineDeviceCount,
  onOpenDetail,
  onInstallAll,
  progress,
  download,
}: CatalogCardProps) {
  const inflightCount = Object.values(progress).filter(
    (p) => p.status === "downloading" || p.status === "installing"
  ).length;
  const doneCount = Object.values(progress).filter((p) => p.status === "done").length;
  const failCount = Object.values(progress).filter((p) => p.status === "fail").length;
  const isBusy = inflightCount > 0 || (download && !download.done);

  return (
    <Card className="overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={onOpenDetail}
        className="block aspect-video bg-muted relative group focus:outline-none"
      >
        {app.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={app.thumbnail_url}
            alt={app.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <Compass className="h-8 w-8" />
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          {app.recommended && (
            <Badge variant="success">
              <Sparkles className="h-3 w-3 mr-0.5 inline" />
              Pick
            </Badge>
          )}
          <Badge variant="outline" className="bg-background/80">
            {app.age_rating}
          </Badge>
        </div>
      </button>
      <CardContent className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold truncate">{app.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {app.publisher}
            </div>
          </div>
          <Badge variant={app.source === "sideload" ? "default" : "secondary"}>
            {app.source === "sideload" ? "Sideload" : "Store"}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {app.short_desc}
        </p>
        <div className="flex flex-wrap gap-1 text-xs">
          {app.subjects.slice(0, 3).map((s) => (
            <Badge key={s} variant="secondary" className="text-[10px]">
              {s}
            </Badge>
          ))}
        </div>
        {(isBusy || doneCount > 0 || failCount > 0) && (
          <div className="text-xs text-muted-foreground border-t border-border pt-2 mt-auto">
            {download && !download.done && (
              <div>
                Downloading {formatBytes(download.downloaded)}
                {download.total ? ` / ${formatBytes(download.total)}` : ""}…
              </div>
            )}
            {download?.done && doneCount + failCount + inflightCount > 0 && (
              <div>
                Installing: {doneCount} done, {inflightCount} in progress
                {failCount > 0 ? `, ${failCount} failed` : ""}
              </div>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenDetail}
            className="flex-1"
          >
            Details
          </Button>
          {app.source === "sideload" ? (
            <Button
              size="sm"
              onClick={onInstallAll}
              disabled={onlineDeviceCount === 0 || isBusy}
              className="flex-1"
            >
              {isBusy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              Install ({onlineDeviceCount})
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              className="flex-1"
              onClick={() => window.open(app.source_url, "_blank")}
            >
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              Quest Store
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function withState(
  m: ProgressMap,
  appId: string,
  serial: string,
  state: PerHeadsetState
): ProgressMap {
  return {
    ...m,
    [appId]: {
      ...(m[appId] ?? {}),
      [serial]: state,
    },
  };
}
