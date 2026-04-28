import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Action {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "ghost";
}

interface Props {
  icon: LucideIcon;
  title: string;
  description?: string;
  primary?: Action;
  secondary?: Action;
  className?: string;
}

/**
 * Friendly empty-state pattern used across pages. Big circle icon, title,
 * one-line explanation, optional call-to-action button.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primary,
  secondary,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-16 px-6 max-w-md mx-auto",
        className
      )}
    >
      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Icon className="h-8 w-8 text-primary" />
      </div>
      <h3 className="text-base font-semibold mb-1.5">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}
      {(primary || secondary) && (
        <div className="flex items-center justify-center gap-2 mt-5">
          {secondary && (
            <Button
              variant={secondary.variant ?? "outline"}
              onClick={secondary.onClick}
            >
              {secondary.label}
            </Button>
          )}
          {primary && (
            <Button
              variant={primary.variant ?? "default"}
              onClick={primary.onClick}
            >
              {primary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
