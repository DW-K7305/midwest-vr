import { cn } from "@/lib/utils";

interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, right, className }: Props) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-6 py-5 border-b border-border",
        className
      )}
    >
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}
