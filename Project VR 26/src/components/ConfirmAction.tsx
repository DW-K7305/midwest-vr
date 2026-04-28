/**
 * Visual confirmation dialog used for both install and uninstall actions.
 * Shows a thumbnail, name, the action wording in plain English, and the
 * scope of what's about to happen ("on 9 headsets"). Big buttons, calm color
 * palette for installs, destructive red for removals.
 */
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Download, HelpCircle, Trash2 } from "lucide-react";

export interface ConfirmTarget {
  /** Visible name (e.g. "Open Brush" or "com.foo.bar") */
  name: string;
  /** Optional thumbnail to show — falls back to a generic icon if absent. */
  thumbnail?: string | null;
  /** Optional subtitle — publisher, version, package name, etc. */
  subtitle?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What we're doing. Drives wording + button color. */
  action: "install" | "uninstall";
  /** The app(s) the action affects. Multiple is fine — they show as a list. */
  targets: ConfirmTarget[];
  /** Number of headsets being affected. */
  headsetCount: number;
  /** Optional warning to show in an amber callout. */
  warning?: string | null;
  onConfirm: () => void;
}

export function ConfirmAction({
  open,
  onOpenChange,
  action,
  targets,
  headsetCount,
  warning,
  onConfirm,
}: Props) {
  const isInstall = action === "install";
  const Icon = isInstall ? Download : Trash2;
  const verb = isInstall ? "Install" : "Remove";
  const prepText = isInstall ? "onto" : "from";
  const headsetWord = headsetCount === 1 ? "headset" : "headsets";

  const title =
    targets.length === 1
      ? `${verb} ${targets[0].name} ${prepText} ${headsetCount} ${headsetWord}?`
      : `${verb} ${targets.length} apps ${prepText} ${headsetCount} ${headsetWord}?`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon
              className={
                isInstall
                  ? "h-5 w-5 text-primary"
                  : "h-5 w-5 text-destructive"
              }
            />
            {title}
          </DialogTitle>
          <DialogDescription>
            {isInstall
              ? "Each headset will receive the app(s) below. You can monitor progress per headset on the next screen."
              : "Each headset will have the app(s) below removed. App data on the headset is also wiped."}
          </DialogDescription>
        </DialogHeader>

        {/* Visual list of targets */}
        <div className="rounded-md border border-border divide-y divide-border max-h-72 overflow-y-auto">
          {targets.map((t, i) => (
            <TargetRow key={i} target={t} />
          ))}
        </div>

        {warning && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <span className="text-amber-300/90">{warning}</span>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={isInstall ? "default" : "destructive"}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            <Icon className="h-4 w-4 mr-2" />
            {verb}
            {targets.length > 1 ? ` ${targets.length} apps` : ""} on{" "}
            {headsetCount} {headsetWord}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetRow({ target }: { target: ConfirmTarget }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="h-12 w-12 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        {target.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={target.thumbnail}
            alt={target.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <HelpCircle className="h-5 w-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <div className="font-medium truncate">{target.name}</div>
        {target.subtitle && (
          <div className="text-xs text-muted-foreground truncate font-mono">
            {target.subtitle}
          </div>
        )}
      </div>
    </div>
  );
}

/** Helper: a single-headset count badge for inline use. */
export function HeadsetCountBadge({ count }: { count: number }) {
  return (
    <Badge variant={count > 0 ? "default" : "outline"}>
      {count} headset{count === 1 ? "" : "s"}
    </Badge>
  );
}
