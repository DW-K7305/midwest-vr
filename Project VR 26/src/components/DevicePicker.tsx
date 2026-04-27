import { useDevices } from "@/hooks/useDevices";
import { Button } from "@/components/ui/button";
import { Check, Headphones, RefreshCw } from "lucide-react";
import { cn, shortSerial } from "@/lib/utils";

interface Props {
  selected: string | null;
  onSelect: (serial: string) => void;
}

export function DevicePicker({ selected, onSelect }: Props) {
  const { data: devices, refetch, isFetching } = useDevices();
  const online = (devices ?? []).filter((d) => d.state === "device");

  return (
    <div className="rounded-lg border border-border p-3 bg-card/40">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Headset
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-7 px-2"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
        </Button>
      </div>
      {online.length === 0 ? (
        <div className="text-sm text-muted-foreground py-2">
          No online headsets — connect one via USB.
        </div>
      ) : (
        <div className="space-y-1">
          {online.map((d) => (
            <button
              key={d.serial}
              onClick={() => onSelect(d.serial)}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                selected === d.serial
                  ? "bg-primary/15 text-foreground"
                  : "hover:bg-accent"
              )}
            >
              <Headphones className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 truncate">
                {d.model ?? "Quest"}{" "}
                <span className="text-muted-foreground font-mono">
                  {shortSerial(d.serial)}
                </span>
              </span>
              {selected === d.serial && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
