import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  ExternalLink,
  Globe,
  HardDrive,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import type { AppSettings } from "@/types";

export function SettingsPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.getSettings });
  const storage = useQuery({
    queryKey: ["storage_info"],
    queryFn: api.getStorageInfo,
  });
  const adb = useQuery({
    queryKey: ["adb_health"],
    queryFn: api.adbHealth,
    retry: false,
  });
  const allowedHosts = useQuery({
    queryKey: ["allowed_hosts"],
    queryFn: api.networkAllowedHosts,
    staleTime: Infinity,
  });
  const netLog = useQuery({
    queryKey: ["network_log"],
    queryFn: api.networkLog,
    refetchInterval: 3000,
  });

  const [draft, setDraft] = useState<AppSettings | null>(null);
  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

  async function save(next: AppSettings) {
    try {
      const saved = await api.saveSettings(next);
      qc.setQueryData(["settings"], saved);
      setDraft(saved);
      toast.success("Settings saved");
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Save failed");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" subtitle="App behavior, storage, and network" />
      <div className="flex-1 p-6 overflow-y-auto space-y-4 max-w-3xl">
        {/* Online catalog */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-primary" />
              <div className="font-medium">Online catalog (Discover)</div>
              <Badge
                variant={
                  draft?.online_catalog_enabled ? "success" : "outline"
                }
              >
                {draft?.online_catalog_enabled ? "ON" : "OFF"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Lets the Discover tab fetch a curated catalog of K-12-friendly
              Quest 2 apps and download approved APKs. Default is OFF — when
              OFF the app makes <strong>zero outbound network connections</strong>.
              When ON, the app only contacts the hosts listed below; everything
              else is rejected at the network layer.
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() =>
                  draft &&
                  save({
                    ...draft,
                    online_catalog_enabled: !draft.online_catalog_enabled,
                  })
                }
                disabled={!draft}
              >
                {draft?.online_catalog_enabled ? "Disable" : "Enable"} online catalog
              </Button>
            </div>

            <div className="text-xs">
              <div className="uppercase tracking-wider text-muted-foreground mb-1">
                Hardcoded allowlist
              </div>
              <ul className="font-mono space-y-0.5">
                {(allowedHosts.data ?? []).map((h) => (
                  <li key={h} className="text-foreground/80">
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Network activity log */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <div className="font-medium">Network activity log</div>
              <span className="text-xs text-muted-foreground">
                in-memory · no telemetry
              </span>
              <div className="ml-auto">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await api.networkClearLog();
                    qc.invalidateQueries({ queryKey: ["network_log"] });
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              </div>
            </div>
            {(netLog.data ?? []).length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No outbound requests recorded yet.
              </div>
            ) : (
              <div className="rounded-md border border-border max-h-72 overflow-y-auto divide-y divide-border">
                {(netLog.data ?? [])
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <div
                      key={i}
                      className="px-3 py-2 text-xs flex items-start gap-2"
                    >
                      <span
                        className={`font-mono shrink-0 ${
                          e.allowed ? "text-emerald-400" : "text-destructive"
                        }`}
                      >
                        {e.allowed ? "ALLOW" : "BLOCK"}
                      </span>
                      <span className="font-mono shrink-0 text-muted-foreground">
                        {e.method}
                      </span>
                      <span className="font-mono truncate flex-1" title={e.url}>
                        {e.url}
                      </span>
                      {e.status && (
                        <span className="font-mono text-muted-foreground shrink-0">
                          {e.status}
                        </span>
                      )}
                      {e.error && (
                        <span className="text-destructive shrink-0">
                          {e.error}
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <HardDrive className="h-5 w-5 text-primary" />
              <div className="font-medium">Storage</div>
              {storage.data?.portable && (
                <Badge variant="success">Portable mode</Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              Config file:{" "}
              <span className="font-mono text-foreground">
                {storage.data?.config_path ?? "—"}
              </span>
            </div>
            {storage.data?.volume_root && (
              <div className="text-sm text-muted-foreground">
                Running from volume:{" "}
                <span className="font-mono text-foreground">
                  {storage.data.volume_root}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* adb */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-primary" />
              <div className="font-medium">Bundled adb</div>
            </div>
            <div className="text-sm">
              {adb.isLoading ? (
                "Checking…"
              ) : adb.isError ? (
                <span className="text-destructive">
                  adb missing — try the latest build
                </span>
              ) : (
                <span className="font-mono">{adb.data}</span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => adb.refetch()}
              disabled={adb.isFetching}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-2 ${
                  adb.isFetching ? "animate-spin" : ""
                }`}
              />
              Re-check
            </Button>
          </CardContent>
        </Card>

        {/* Polling */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="font-medium">Dashboard polling</div>
            <div className="space-y-2">
              <Label htmlFor="poll">Refresh interval (ms)</Label>
              <Input
                id="poll"
                type="number"
                min={1000}
                step={500}
                value={draft?.poll_interval_ms ?? 4000}
                onChange={(e) =>
                  draft &&
                  setDraft({
                    ...draft,
                    poll_interval_ms: Number(e.target.value),
                  })
                }
              />
            </div>
            <Button onClick={() => draft && save(draft)} disabled={!draft}>
              Save
            </Button>
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardContent className="p-5 space-y-2 text-sm">
            <div className="font-medium">About</div>
            <div className="text-muted-foreground">
              MidWest-VR — locally-managed Meta Quest 2 fleet manager for K-12.
            </div>
            <div className="text-muted-foreground flex items-center gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" />
              <a
                href="https://developers.meta.com/horizon/documentation/native/android/mobile-device-setup/"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Meta Developer Mode docs
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
