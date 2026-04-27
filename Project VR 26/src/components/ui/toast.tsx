/**
 * Tiny imperative toast system. Not a full Radix Toast install — we just need
 * "show a transient message after an action" and don't want the API ceremony.
 *
 * Usage:
 *   import { toast, ToastViewport } from "@/components/ui/toast";
 *   toast.success("APK installed");
 *   toast.error("adb not found");
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

type ToastKind = "success" | "error" | "info" | "warning";
interface ToastMsg {
  id: number;
  kind: ToastKind;
  text: string;
}

let nextId = 1;
const listeners = new Set<(msgs: ToastMsg[]) => void>();
let queue: ToastMsg[] = [];

function emit() {
  for (const l of listeners) l(queue);
}

function push(kind: ToastKind, text: string, ttl = 3500) {
  const id = nextId++;
  queue = [...queue, { id, kind, text }];
  emit();
  setTimeout(() => {
    queue = queue.filter((m) => m.id !== id);
    emit();
  }, ttl);
}

export const toast = {
  success: (t: string) => push("success", t),
  error: (t: string) => push("error", t, 5500),
  info: (t: string) => push("info", t),
  warning: (t: string) => push("warning", t, 5000),
};

const ICONS: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
};
const COLORS: Record<ToastKind, string> = {
  success: "text-emerald-400",
  error: "text-destructive",
  info: "text-primary",
  warning: "text-amber-400",
};

export function ToastViewport() {
  const [msgs, setMsgs] = useState<ToastMsg[]>([]);
  useEffect(() => {
    listeners.add(setMsgs);
    return () => {
      listeners.delete(setMsgs);
    };
  }, []);
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[360px]">
      {msgs.map((m) => {
        const Icon = ICONS[m.kind];
        return (
          <div
            key={m.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border border-border bg-card/95 backdrop-blur shadow-lg p-3 animate-fade-in"
            )}
          >
            <Icon className={cn("h-5 w-5 mt-0.5", COLORS[m.kind])} />
            <span className="text-sm leading-snug select-text">{m.text}</span>
          </div>
        );
      })}
    </div>
  );
}
