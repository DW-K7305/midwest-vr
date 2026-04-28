/**
 * Tiny dependency-free tooltip. Hover or focus → small floating bubble.
 * Used for "what does this do?" labels on icon-only buttons and tech-y settings.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  disabled?: boolean;
}

export function Tooltip({
  label,
  children,
  side = "top",
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    if (open) {
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }
  }, [open]);

  if (disabled) return <>{children}</>;

  const placement: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };

  return (
    <span
      ref={ref}
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={cn(
            "absolute z-50 px-2 py-1 rounded-md text-[11px] leading-tight bg-foreground text-background shadow-lg whitespace-nowrap pointer-events-none animate-fade-in",
            placement[side]
          )}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/** Inline help bubble — a "?" icon that, when hovered, explains what something does. */
export function HelpBubble({ label }: { label: string }) {
  return (
    <Tooltip label={label} side="top">
      <span
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted text-muted-foreground text-[10px] cursor-help align-middle ml-1"
        tabIndex={0}
        aria-label={`Help: ${label}`}
      >
        ?
      </span>
    </Tooltip>
  );
}
