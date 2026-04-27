import { NavLink } from "react-router-dom";
import {
  Activity,
  Boxes,
  Lock,
  Wifi,
  Settings as SettingsIcon,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDevices } from "@/hooks/useDevices";

const NAV = [
  { to: "/", label: "Dashboard", icon: Activity, exact: true },
  { to: "/connect", label: "Connect", icon: Plug },
  { to: "/apps", label: "Apps", icon: Boxes },
  { to: "/kiosk", label: "Kiosk", icon: Lock },
  { to: "/wifi", label: "Wi-Fi", icon: Wifi },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  const { data: devices } = useDevices();
  const onlineCount = devices?.filter((d) => d.state === "device").length ?? 0;
  const totalCount = devices?.length ?? 0;

  return (
    <nav className="w-56 shrink-0 border-r border-border bg-card/30 flex flex-col">
      <div className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        Workspace
      </div>
      <ul className="px-2 space-y-0.5 flex-1">
        {NAV.map(({ to, label, icon: Icon, exact }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={exact}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="border-t border-border p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">
          Headsets
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              onlineCount > 0 ? "bg-emerald-500" : "bg-muted-foreground/40"
            )}
          />
          <span className="text-sm">
            {onlineCount}
            <span className="text-muted-foreground"> / {totalCount} online</span>
          </span>
        </div>
      </div>
    </nav>
  );
}
