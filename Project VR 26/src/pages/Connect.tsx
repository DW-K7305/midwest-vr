import { useDevices } from "@/hooks/useDevices";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Smartphone,
  Cable,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    icon: Smartphone,
    title: "1. Enable Developer Mode (one time per headset)",
    body: (
      <>
        On the iPhone or Android paired with the headset, open the{" "}
        <strong>Meta Quest</strong> app. Tap{" "}
        <strong>Menu → Devices → [your headset]</strong>, then{" "}
        <strong>Headset settings → Developer mode → On</strong>. If the toggle
        isn't there, you may need to{" "}
        <a
          href="https://developers.meta.com/horizon/documentation/native/android/mobile-device-setup/"
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
        >
          create a free developer org
        </a>{" "}
        first — takes one minute.
      </>
    ),
  },
  {
    icon: Cable,
    title: "2. Plug the headset into this Mac",
    body: (
      <>
        Use a USB-C cable. The cable that came with the headset works. Cheap
        charge-only cables don't — you need a data cable.
      </>
    ),
  },
  {
    icon: Headphones,
    title: "3. Put on the headset and tap “Always allow from this computer”",
    body: (
      <>
        The first time, the headset shows a small dialog asking whether to
        trust this Mac. Check <strong>Always allow</strong>, then tap{" "}
        <strong>OK</strong>. MidWest-VR will see the headset within a few
        seconds.
      </>
    ),
  },
];

export function Connect() {
  const { data: devices } = useDevices();
  const detected = devices ?? [];
  const onlineCount = detected.filter((d) => d.state === "device").length;
  const unauthCount = detected.filter((d) => d.state === "unauthorized").length;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Connect a headset"
        subtitle="One-time setup per Meta Quest 2 — about 90 seconds"
      />
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <Card key={i}>
                <CardContent className="p-5 flex gap-4">
                  <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium">{title}</div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {body}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <Card>
              <CardContent className="p-5">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
                  Live status
                </div>
                <StatusRow
                  state={onlineCount > 0 ? "ok" : "wait"}
                  label={
                    onlineCount > 0
                      ? `${onlineCount} headset${onlineCount === 1 ? "" : "s"} ready`
                      : "Searching for headsets…"
                  }
                />
                {unauthCount > 0 && (
                  <StatusRow
                    state="warn"
                    label={`${unauthCount} headset${
                      unauthCount === 1 ? "" : "s"
                    } waiting for permission — tap Allow on the headset`}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 space-y-3">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Detected
                </div>
                {detected.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Nothing yet. Make sure the cable is plugged into a USB port,
                    not just a charger brick.
                  </div>
                ) : (
                  detected.map((d) => (
                    <div
                      key={d.serial}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {d.model ?? "Quest"}
                        </div>
                        <div className="text-xs font-mono text-muted-foreground truncate">
                          {d.serial}
                        </div>
                      </div>
                      <StateBadge state={d.state} />
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground space-y-2">
                <div className="font-medium text-foreground">Stuck?</div>
                <ul className="list-disc list-inside space-y-1">
                  <li>Try the cable in a different USB port.</li>
                  <li>
                    On the headset, hold the power button and pick{" "}
                    <em>Restart</em>.
                  </li>
                  <li>
                    Re-toggle Developer Mode in the Meta Quest mobile app, then
                    re-plug.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusRow({
  state,
  label,
}: {
  state: "ok" | "wait" | "warn";
  label: string;
}) {
  const Icon =
    state === "ok" ? CheckCircle2 : state === "warn" ? AlertCircle : Loader2;
  const color =
    state === "ok"
      ? "text-emerald-400"
      : state === "warn"
      ? "text-amber-400"
      : "text-muted-foreground";
  return (
    <div className="flex items-center gap-2 text-sm py-1">
      <Icon className={cn("h-4 w-4", color, state === "wait" && "animate-spin")} />
      <span>{label}</span>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  switch (state) {
    case "device":
      return <Badge variant="success">Ready</Badge>;
    case "unauthorized":
      return <Badge variant="warning">Tap Allow</Badge>;
    case "offline":
      return <Badge variant="destructive">Offline</Badge>;
    default:
      return <Badge variant="outline">{state}</Badge>;
  }
}
