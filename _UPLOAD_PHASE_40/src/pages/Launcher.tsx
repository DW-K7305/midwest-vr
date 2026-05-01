import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { PageHeader } from "@/components/PageHeader";
import { SubNav, SETUP_NAV } from "@/components/SubNav";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { HelpBubble } from "@/components/ui/tooltip";
import {
  CheckCircle2,
  FileBox,
  Home,
  Layout,
  Loader2,
  Rocket,
  XCircle,
} from "lucide-react";
import { api, onLauncherPushEvent } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices } from "@/hooks/useDevices";
import type { LauncherPushEvent } from "@/types";

type Status = "idle" | "running" | "done" | "fail";

interface PerHeadset {
  status: Status;
  step?: string;
  error?: string;
}

export function LauncherPage() {
  const { data: devices } = useDevices();
  const onlineDevices = (devices ?? []).filter((d) => d.state === "device");

  const [apkPath, setApkPath] = useState<string>("");
  const [schoolName, setSchoolName] = useState("Classroom");
  const [greeting, setGreeting] = useState("");
  const [includeSystem, setIncludeSystem] = useState(false);
  const [allowlistText, setAllowlistText] = useState("");
  const [setAsHome, setSetAsHome] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [progress, setProgress] = useState<Record<string, PerHeadset>>({});

  // Subscribe to push events.
  const unlistenRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    onLauncherPushEvent((e) => handleEvent(e)).then((u) => (unlistenRef.current = u));
    return () => unlistenRef.current?.();
  }, []);

  function handleEvent(e: LauncherPushEvent) {
    setProgress((prev) => {
      const next = { ...prev };
      const cur = next[e.serial] ?? { status: "idle" as Status };
      switch (e.type) {
        case "headset_start":
          next[e.serial] = { status: "running", step: "Starting" };
          break;
        case "headset_install":
          next[e.serial] = { status: "running", step: "Installing APK" };
          break;
        case "headset_config":
          next[e.serial] = { status: "running", step: "Pushing config" };
          break;
        case "headset_set_home":
          next[e.serial] = { status: "running", step: "Setting as home" };
          break;
        case "headset_done":
          next[e.serial] = { ...cur, status: "done", step: "Done" };
          break;
        case "headset_fail":
          next[e.serial] = { status: "fail", step: "Failed", error: e.error };
          break;
      }
      return next;
    });
  }

  async function pickApk() {
    const picked = await openDialog({
      multiple: false,
      filters: [{ name: "Android APK", extensions: ["apk"] }],
    });
    if (picked && !Array.isArray(picked)) setApkPath(picked as string);
  }

  async function push() {
    if (!apkPath) {
      toast.error("Pick the launcher APK first.");
      return;
    }
    if (onlineDevices.length === 0) {
      toast.error("No online headsets.");
      return;
    }
    const allowlist = allowlistText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const config = {
      school_name: schoolName.trim(),
      greeting: greeting.trim(),
      include_system: includeSystem,
      allowlist,
    };
    const serials = onlineDevices.map((d) => d.serial);
    setProgress(Object.fromEntries(serials.map((s) => [s, { status: "running" as Status }])));
    setPushing(true);
    try {
      await api.launcherPush(serials, apkPath, config, setAsHome);
      toast.success("Launcher push complete.");
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? "Push failed");
    } finally {
      setPushing(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="In-headset Launcher"
        subtitle="Replace Quest's stock home screen with our custom one — required for Class Mode lock to actually work"
      />
      <SubNav items={SETUP_NAV} />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-3xl">
        {/* APK picker */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <FileBox className="h-5 w-5 text-primary" />
              <div className="font-medium">Launcher APK</div>
              <HelpBubble label="Download midwest-vr-launcher.apk from the GitHub Actions artifacts after the launcher build completes, then point this picker at it." />
            </div>
            <p className="text-xs text-muted-foreground">
              Download <span className="font-mono">midwest-vr-launcher.apk</span>{" "}
              from your GitHub Actions "Build MidWest-VR Launcher" run, save it
              anywhere on your Mac, then pick it here. We'll cache the path.
            </p>
            <div className="flex items-center gap-2">
              <Input
                readOnly
                value={apkPath}
                placeholder="(no APK selected)"
                className="font-mono text-xs"
              />
              <Button variant="outline" size="sm" onClick={pickApk}>
                Choose…
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Layout className="h-5 w-5 text-primary" />
              <div className="font-medium">Launcher configuration</div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="school">School name</Label>
                <Input
                  id="school"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="Lincoln Middle School"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="greeting">Custom greeting (optional)</Label>
                <Input
                  id="greeting"
                  value={greeting}
                  onChange={(e) => setGreeting(e.target.value)}
                  placeholder="Welcome, Wildcats"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="allowlist">
                Approved app allowlist (optional)
                <HelpBubble label="One package name per line. If empty, all third-party apps show. Get package names from the Apps tab — e.g. com.beatgames.beatsaber" />
              </Label>
              <textarea
                id="allowlist"
                value={allowlistText}
                onChange={(e) => setAllowlistText(e.target.value)}
                placeholder={"com.AnotherAxiom.GorillaTag\ncom.beatgames.beatsaber\ncom.Icosa.OpenBrush"}
                className="w-full min-h-[100px] rounded-md border border-input bg-background p-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeSystem}
                onChange={(e) => setIncludeSystem(e.target.checked)}
                className="accent-primary"
              />
              Include system apps (Settings, browser, etc.)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={setAsHome}
                onChange={(e) => setSetAsHome(e.target.checked)}
                className="accent-primary"
              />
              Try to set as system launcher (headset will prompt to confirm)
            </label>
          </CardContent>
        </Card>

        {/* Action */}
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Rocket className="h-5 w-5 text-primary" />
              <div className="font-medium">
                Push to {onlineDevices.length} online headset
                {onlineDevices.length === 1 ? "" : "s"}
              </div>
            </div>
            <Button
              onClick={push}
              disabled={pushing || !apkPath || onlineDevices.length === 0}
            >
              {pushing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Home className="h-4 w-4 mr-2" />
              )}
              Push launcher
            </Button>

            {/* Per-headset status */}
            {Object.keys(progress).length > 0 && (
              <div className="rounded-md border border-border divide-y divide-border mt-3">
                {Object.entries(progress).map(([serial, s]) => (
                  <div
                    key={serial}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <div className="font-mono text-xs">{serial}</div>
                    <div className="flex items-center gap-2">
                      {s.status === "done" ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Done
                        </Badge>
                      ) : s.status === "fail" ? (
                        <Badge variant="destructive" title={s.error}>
                          <XCircle className="h-3 w-3 mr-1" />
                          Failed
                        </Badge>
                      ) : (
                        <Badge variant="outline">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          {s.step ?? "Starting"}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
