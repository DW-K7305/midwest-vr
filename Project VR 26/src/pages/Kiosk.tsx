import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { DevicePicker } from "@/components/DevicePicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, Headphones } from "lucide-react";
import { api } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices } from "@/hooks/useDevices";

export function Kiosk() {
  const { data: devices } = useDevices();
  const onlineDevices = (devices ?? []).filter((d) => d.state === "device");
  const [serial, setSerial] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!serial && onlineDevices.length) setSerial(onlineDevices[0].serial);
  }, [onlineDevices, serial]);

  const apps = useQuery({
    queryKey: ["apps", serial],
    queryFn: () => api.listApps(serial!),
    enabled: !!serial,
  });

  const current = useQuery({
    queryKey: ["kiosk", serial],
    queryFn: () => api.currentKiosk(serial!),
    enabled: !!serial,
    refetchInterval: 8000,
  });

  async function pin(pkg: string) {
    if (!serial) return;
    try {
      await api.setKiosk(serial, pkg);
      toast.success(`Kiosk locked to ${pkg}`);
      qc.invalidateQueries({ queryKey: ["kiosk", serial] });
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Set kiosk failed");
    }
  }

  async function unpin() {
    if (!serial) return;
    try {
      await api.clearKiosk(serial);
      toast.success("Kiosk cleared");
      qc.invalidateQueries({ queryKey: ["kiosk", serial] });
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Clear failed");
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Kiosk mode"
        subtitle="Lock a headset to a single app — perfect for classroom stations"
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-border p-4 space-y-4">
          <DevicePicker selected={serial} onSelect={setSerial} />
          {serial && (
            <Card>
              <CardContent className="p-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                  Current
                </div>
                {current.data ? (
                  <>
                    <div className="font-mono text-sm truncate">
                      {current.data}
                    </div>
                    <Button
                      onClick={unpin}
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                    >
                      <Unlock className="h-3.5 w-3.5 mr-2" />
                      Clear kiosk
                    </Button>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Not pinned to any app.
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </aside>
        <div className="flex-1 p-4 overflow-y-auto">
          {!serial ? (
            <Empty>Select a headset.</Empty>
          ) : apps.isLoading ? (
            <Empty>Loading apps…</Empty>
          ) : (apps.data ?? []).length === 0 ? (
            <Empty>
              <Headphones className="h-4 w-4 inline mr-2" />
              No apps installed. Sideload one from the Apps page first.
            </Empty>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(apps.data ?? []).map((a) => (
                <Card key={a.package} className="hover:border-primary/40">
                  <CardContent className="p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-mono text-sm truncate">
                          {a.package}
                        </div>
                      </div>
                      {current.data === a.package && (
                        <Badge variant="success">Pinned</Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => pin(a.package)}
                      disabled={current.data === a.package}
                    >
                      <Lock className="h-3.5 w-3.5 mr-2" />
                      {current.data === a.package
                        ? "Already pinned"
                        : "Pin to this app"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sm text-muted-foreground py-12 text-center">
      {children}
    </div>
  );
}
