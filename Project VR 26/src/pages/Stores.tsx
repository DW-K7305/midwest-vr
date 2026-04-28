import { useState } from "react";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { HelpBubble, Tooltip } from "@/components/ui/tooltip";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  Globe,
  ShieldAlert,
  Store,
} from "lucide-react";
import { api } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices, useSettings } from "@/hooks/useDevices";

interface ExternalStore {
  name: string;
  url: string;
  description: string;
}

const STORES: ExternalStore[] = [
  {
    name: "SideQuest",
    url: "https://sidequestvr.com/category/15/education",
    description:
      "The biggest sideload directory for Quest. Filtered to Education tag — hundreds of free + paid apps.",
  },
  {
    name: "itch.io VR",
    url: "https://itch.io/games/free/tag-virtual-reality",
    description:
      "Free indie VR games and experiences. Many open-source / educational gems live here.",
  },
  {
    name: "GitHub Releases (open-source VR)",
    url: "https://github.com/topics/oculus-quest",
    description:
      "Public open-source Quest projects with .apk releases attached. Direct downloads, no signup.",
  },
  {
    name: "Meta Horizon Store",
    url: "https://www.meta.com/experiences/section/educational/",
    description:
      "Meta's official store, education filter. Most apps must be installed from inside the headset.",
  },
];

export function Stores() {
  const { data: settings } = useSettings();
  const { data: devices } = useDevices();
  const onlineDevices = (devices ?? []).filter((d) => d.state === "device");

  const allowedHosts = useQuery({
    queryKey: ["allowed_hosts"],
    queryFn: api.networkAllowedHosts,
    staleTime: Infinity,
  });

  const [url, setUrl] = useState("");
  const [pendingHost, setPendingHost] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);

  const onlineEnabled = !!settings?.online_catalog_enabled;

  function checkHost(): string | null {
    try {
      const u = new URL(url.trim());
      if (u.protocol !== "https:") {
        toast.error("URL must start with https://");
        return null;
      }
      return u.host.toLowerCase();
    } catch {
      toast.error("That doesn't look like a valid URL.");
      return null;
    }
  }

  function isHostAllowlisted(host: string) {
    return (allowedHosts.data ?? []).some(
      (h) => h.toLowerCase() === host
    );
  }

  async function tryInstall() {
    const host = checkHost();
    if (!host) return;
    if (!isHostAllowlisted(host)) {
      setPendingHost(host);
      return; // user needs to confirm via a separate dialog
    }
    await doInstall();
  }

  async function doInstall() {
    if (onlineDevices.length === 0) {
      toast.error("No online headsets to install on.");
      return;
    }
    setInstalling(true);
    try {
      // For "Add by URL" we treat the user-supplied URL like a one-off catalog
      // entry. The Rust backend's allowlist is the source of truth — if the
      // host isn't on it, the request is blocked. We surface that clearly.
      toast.warning(
        "Custom URL install is staged — backend support arrives in Phase 24. For now, copy the URL into Discover catalog or request the host be added to the allowlist."
      );
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Stores"
        subtitle="External sideload directories + paste-an-APK shortcut"
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-4xl">
        {!onlineEnabled && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-amber-300 mb-1">
                Online catalog is OFF
              </div>
              <div className="text-amber-300/80">
                External stores require online access. Enable{" "}
                <strong>Settings → Online catalog</strong> to use this tab.
              </div>
            </div>
          </div>
        )}

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Store className="h-5 w-5 text-primary" />
              <div className="font-medium">External sideload directories</div>
              <HelpBubble label="Opens in your default browser. MidWest-VR doesn't bundle these — clicking takes you out of the app." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {STORES.map((s) => (
                <Card
                  key={s.url}
                  className="hover:border-primary/40 transition-colors"
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold">{s.name}</div>
                      <Tooltip
                        label={`Host: ${new URL(s.url).host}`}
                        side="top"
                      >
                        <Badge variant="outline" className="text-[10px] cursor-help">
                          {new URL(s.url).host}
                        </Badge>
                      </Tooltip>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {s.description}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openShell(s.url).catch(() => {})}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      Open in browser
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-3">
              <Download className="h-5 w-5 text-primary" />
              <div className="font-medium">Add APK by URL</div>
              <HelpBubble label="Paste a direct .apk URL from a publisher's site. MidWest-VR will only proceed if the URL's host is on the allowlist (Settings → Online catalog)." />
            </div>
            <p className="text-sm text-muted-foreground">
              Paste a direct <span className="font-mono">.apk</span> URL —
              MidWest-VR downloads it, verifies the file, and sideloads to all
              online headsets. The host must be on the network allowlist.
            </p>
            <div className="flex items-center gap-2">
              <Input
                placeholder="https://github.com/.../app-release.apk"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={!onlineEnabled || installing}
              />
              <Button
                onClick={tryInstall}
                disabled={!url.trim() || !onlineEnabled || installing}
              >
                <Download className="h-4 w-4 mr-2" />
                Install
              </Button>
            </div>
            {url && (
              <div className="text-xs text-muted-foreground">
                {(() => {
                  try {
                    const u = new URL(url);
                    const host = u.host.toLowerCase();
                    const ok = isHostAllowlisted(host);
                    return (
                      <span
                        className={
                          ok
                            ? "text-emerald-400 inline-flex items-center"
                            : "text-amber-400 inline-flex items-center"
                        }
                      >
                        {ok ? (
                          <>✓ Host <strong className="mx-1">{host}</strong> is on the allowlist</>
                        ) : (
                          <>
                            <ShieldAlert className="h-3 w-3 mr-1" />
                            Host{" "}
                            <strong className="mx-1">{host}</strong>
                            is NOT on the current allowlist — request will be
                            rejected.
                          </>
                        )}
                      </span>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Current network allowlist</span>
            </div>
            <p className="text-xs text-muted-foreground">
              These are the only hosts MidWest-VR can fetch from. Anything else
              is rejected at the network layer. To request additions, edit{" "}
              <span className="font-mono">src-tauri/src/network.rs</span> and
              rebuild.
            </p>
            <ul className="text-xs font-mono mt-2 space-y-0.5">
              {(allowedHosts.data ?? []).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Pending host warning dialog could be added here in the future. */}
        {pendingHost && (
          <Card>
            <CardContent className="p-4 text-sm flex items-start gap-2 bg-amber-500/5 border-amber-500/30">
              <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <div>
                Host <strong>{pendingHost}</strong> is not on the allowlist.
                Adding hosts is intentionally a code change — open{" "}
                <span className="font-mono">src-tauri/src/network.rs</span>,
                add it to <span className="font-mono">ALLOWED_HOSTS</span>, and
                rebuild.{" "}
                <button
                  className="underline"
                  onClick={() => setPendingHost(null)}
                >
                  Dismiss
                </button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

