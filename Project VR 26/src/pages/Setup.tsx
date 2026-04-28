import { useState } from "react";
import { open as openShell } from "@tauri-apps/plugin-shell";
import { PageHeader } from "@/components/PageHeader";
import { DevicePicker } from "@/components/DevicePicker";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Camera,
  Clock,
  Edit3,
  Power,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/tauri";
import { toast } from "@/components/ui/toast";
import { useDevices } from "@/hooks/useDevices";

export function Setup() {
  const { data: devices } = useDevices();
  const onlineDevices = (devices ?? []).filter((d) => d.state === "device");
  const [serial, setSerial] = useState<string | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  if (!serial && onlineDevices.length) setTimeout(() => setSerial(onlineDevices[0].serial), 0);
  const headsetLabel = (() => {
    const d = onlineDevices.find((d) => d.serial === serial);
    return d?.model ? `${d.model} (${d.serial.slice(-4)})` : serial ?? "—";
  })();

  async function run<T>(label: string, fn: () => Promise<T>, success?: (v: T) => string) {
    if (!serial) {
      toast.error("Pick a headset first.");
      return;
    }
    setBusy(label);
    try {
      const v = await fn();
      toast.success(success ? success(v) : `${label} complete`);
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message ?? `${label} failed`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Headset Setup"
        subtitle="Things you'd normally do from the Meta phone app — done from this Mac instead"
      />
      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 border-r border-border p-4 space-y-4">
          <DevicePicker selected={serial} onSelect={setSerial} />
          <Card>
            <CardContent className="p-3 text-xs text-muted-foreground space-y-1.5">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                What this page is
              </div>
              <p>
                Plug in a Quest, pick it on the left, then use the big buttons
                on the right to rename it, take a screenshot, set the time,
                restart it, or wipe it for the next student.
              </p>
              <p className="text-amber-400/90 pt-1">
                One thing this page can't do: log into a Meta account. Meta
                requires their phone app for that — not us.
              </p>
            </CardContent>
          </Card>
        </aside>
        <div className="flex-1 p-6 overflow-y-auto">
          {!serial && (
            <div className="text-sm text-muted-foreground py-12 text-center">
              Pick a headset on the left to use these tools.
            </div>
          )}

          {serial && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl">
              {/* Rename */}
              <ActionCard
                icon={Edit3}
                title="Rename this headset"
                description="Give it a friendly name like 'Library #3' so you can tell them apart on the Dashboard."
                buttonLabel="Rename…"
                onClick={() => setRenameOpen(true)}
                busy={busy === "Rename"}
              />

              {/* Screenshot */}
              <ActionCard
                icon={Camera}
                title="Screenshot what's on the screen"
                description="Take a photo of whatever is showing in the headset right now. Saves to your Documents folder."
                buttonLabel="Take screenshot"
                onClick={() =>
                  run(
                    "Screenshot",
                    () => api.headsetScreenshot(serial!),
                    (path) => `Saved to ${path}`
                  )
                }
                busy={busy === "Screenshot"}
              />

              {/* Sync time */}
              <ActionCard
                icon={Clock}
                title="Set the headset's clock"
                description="Match the headset's time to your Mac. Useful if it's been off the network for a while."
                buttonLabel="Sync time"
                onClick={() =>
                  run("Sync time", () => api.headsetSyncTime(serial!))
                }
                busy={busy === "Sync time"}
              />

              {/* Reboot */}
              <ActionCard
                icon={RotateCcw}
                title="Restart this headset"
                description="Same as holding the power button → Restart. Takes about 30 seconds. Doesn't affect anything you've installed."
                buttonLabel="Restart"
                variant="outline"
                onClick={() =>
                  run("Restart", () => api.headsetReboot(serial!))
                }
                busy={busy === "Restart"}
              />

              {/* Power off */}
              <ActionCard
                icon={Power}
                title="Power off this headset"
                description="Turn the headset all the way off. Use for end-of-day shutdown."
                buttonLabel="Power off"
                variant="outline"
                onClick={() =>
                  run("Power off", () => api.headsetPowerOff(serial!))
                }
                busy={busy === "Power off"}
              />

              {/* Factory reset (destructive) */}
              <ActionCard
                icon={Trash2}
                title="Erase headset for next student"
                description="Wipes everything: account, apps, settings, save data. The headset boots up like new and asks to be paired again. Cannot be undone."
                buttonLabel="Erase headset…"
                variant="destructive"
                onClick={() => setResetConfirmOpen(true)}
                busy={busy === "Factory reset"}
              />

              {/* Open Quest dev portal */}
              <ActionCard
                icon={Sparkles}
                title="Open Meta Developer Portal"
                description="Where you turn Developer Mode on for new headsets and manage your free dev organization. Opens in your browser."
                buttonLabel="Open in browser"
                variant="outline"
                onClick={() =>
                  openShell("https://developers.meta.com/horizon/manage/").catch(() => {})
                }
                busy={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename {headsetLabel}</DialogTitle>
            <DialogDescription>
              The new name shows up on the Dashboard and in the headset's
              About page. Letters, numbers, and spaces only.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Library #3"
            maxLength={64}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newName.trim()}
              onClick={async () => {
                setRenameOpen(false);
                await run("Rename", () => api.headsetRename(serial!, newName.trim()));
                setNewName("");
              }}
            >
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Factory reset confirm */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Erase {headsetLabel}?
            </DialogTitle>
            <DialogDescription>
              This deletes EVERYTHING on the headset — Meta account,
              installed apps, save data, Wi-Fi networks, custom settings.
              The headset will reboot to the welcome screen and need to be
              paired with a phone again. <strong>This cannot be undone.</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-amber-300/90">
              Use this only when you're done with a student / class and ready
              to hand the headset to someone else.
            </span>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                setResetConfirmOpen(false);
                await run("Factory reset", () =>
                  api.headsetFactoryReset(serial!)
                );
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Yes, erase everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ActionCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  buttonLabel: string;
  variant?: "default" | "outline" | "destructive";
  onClick: () => void;
  busy: boolean;
}

function ActionCard({
  icon: Icon,
  title,
  description,
  buttonLabel,
  variant = "default",
  onClick,
  busy,
}: ActionCardProps) {
  const isDestructive = variant === "destructive";
  return (
    <Card
      className={
        "flex flex-col " +
        (isDestructive ? "border-destructive/30" : "")
      }
    >
      <CardContent className="p-5 flex-1 flex flex-col gap-3">
        <div
          className={
            "h-10 w-10 rounded-md flex items-center justify-center " +
            (isDestructive ? "bg-destructive/10" : "bg-primary/10")
          }
        >
          <Icon
            className={
              "h-5 w-5 " +
              (isDestructive ? "text-destructive" : "text-primary")
            }
          />
        </div>
        <div className="font-medium leading-snug">{title}</div>
        <p className="text-sm text-muted-foreground leading-relaxed flex-1">
          {description}
        </p>
        <Button
          variant={variant}
          onClick={onClick}
          disabled={busy}
          size="sm"
          className="self-start"
        >
          {busy ? "Working…" : buttonLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
