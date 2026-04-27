import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, HardDrive, RefreshCw, Server } from "lucide-react";
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

  const [draft, setDraft] = useState<AppSettings | null>(null);
  useEffect(() => {
    if (settings.data && !draft) setDraft(settings.data);
  }, [settings.data, draft]);

  async function save() {
    if (!draft) return;
    try {
      const next = await api.saveSettings(draft);
      qc.setQueryData(["settings"], next);
      toast.success("Settings saved");
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Save failed");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Settings" subtitle="App behavior and storage" />
      <div className="flex-1 p-6 overflow-y-auto space-y-4 max-w-3xl">
        <Card>
          <CardContent className="p-5 space-y-4">
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
            <p className="text-xs text-muted-foreground">
              When MidWest-VR is launched from a path under{" "}
              <span className="font-mono">/Volumes/</span> (i.e. an external SSD
              or mounted disk), it automatically writes its config next to the{" "}
              <span className="font-mono">.app</span> bundle so plugging the SSD
              into another Mac brings your settings along.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-primary" />
              <div className="font-medium">Bundled adb</div>
            </div>
            <div className="text-sm">
              {adb.isLoading ? (
                "Checking…"
              ) : adb.isError ? (
                <span className="text-destructive">
                  adb missing — re-run <code>./bootstrap.sh</code>
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

        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="font-medium">Polling</div>
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
              <p className="text-xs text-muted-foreground">
                Controls how often the dashboard re-queries adb. Lower = snappier
                UI, more CPU.
              </p>
            </div>
            <Button onClick={save} disabled={!draft}>
              Save
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-2 text-sm">
            <div className="font-medium">About</div>
            <div className="text-muted-foreground">
              MidWest-VR v0.1 — locally-managed Meta Quest 2 fleet manager.
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
