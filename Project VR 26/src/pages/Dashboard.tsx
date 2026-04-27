import { useNavigate } from "react-router-dom";
import { useDevices } from "@/hooks/useDevices";
import { DeviceCard } from "@/components/DeviceCard";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Plug, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function Dashboard() {
  const nav = useNavigate();
  const { data: devices, refetch, isFetching, isError, error } = useDevices();
  const empty = !devices || devices.length === 0;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Dashboard"
        subtitle="Live status of every connected headset"
        right={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="flex-1 p-6 overflow-y-auto">
        {isError && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 mb-4 text-sm">
            <div className="font-medium text-destructive mb-1">
              Couldn't talk to adb
            </div>
            <div className="text-muted-foreground">
              {(error as { message?: string } | undefined)?.message ??
                "Run ./bootstrap.sh again to refresh adb-tools."}
            </div>
          </div>
        )}

        {empty ? (
          <EmptyState onConnect={() => nav("/connect")} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {devices.map((d) => (
              <DeviceCard key={d.serial} device={d} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="max-w-md text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Plug className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">No headsets detected</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Plug a Meta Quest 2 into your Mac with a USB-C cable. If it's a
          brand-new headset, you'll need to enable Developer Mode first — we
          have a step-by-step guide.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button onClick={onConnect}>Open Connect guide</Button>
        </div>
      </div>
    </div>
  );
}
