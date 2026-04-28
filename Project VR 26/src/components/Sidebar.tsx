import { NavLink } from "react-router-dom";
import {
  Activity,
  Boxes,
  Compass,
  GraduationCap,
  Home,
  Radio,
  Sparkles,
  Store,
  Wifi,
  Settings as SettingsIcon,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDevices } from "@/hooks/useDevices";

// Sidebar grouped into a teacher-friendly order:
//   Daily — what you touch every class period
//   Apps — install / browse / curate
//   Setup — first-time-pairing things you do once per headset
//   Settings — last
const NAV = [
  { section: "Daily" },
  { to: "/", label: "Dashboard", icon: Activity, exact: true },
  { to: "/class-mode", label: "Class Mode", icon: GraduationCap },
  { section: "Apps" },
  { to: "/apps", label: "Installed apps", icon: Boxes },
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/stores", label: "Stores", icon: Store },
  { to: "/launcher", label: "In-headset launcher", icon: Home },
  { section: "Setup" },
  { to: "/connect", label: "Connect", icon: Plug },
  { to: "/setup", label: "Headset setup", icon: Sparkles },
  { to: "/wifi", label: "Wi-Fi", icon: Wifi },
  { to: "/wireless", label: "Wireless ADB", icon: Radio },
  { section: "" },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function Sidebar() {
  const { data: devices } = useDevices();
  const onlineCount = devices?.filter((d) => d.state === "device").length ?? 0;
  const totalCount = devices?.length ?? 0;

  return (
    <nav className="w-56 shrink-0 border-r border-border bg-card/30 flex flex-col">
      <ul className="px-2 pt-2 space-y-0.5 flex-1">
        {NAV.map((item, idx) => {
          if ("section" in item) {
            // Section header (or spacer if empty string).
            return (
              <li
                key={`section-${idx}`}
                className={cn(
                  "px-2.5 text-[10px] uppercase tracking-wider text-muted-foreground/70",
                  item.section ? "pt-3 pb-1" : "pt-2"
                )}
              >
                {item.section}
              </li>
            );
          }
          const { to, label, icon: Icon, exact } = item;
          return (
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
          );
        })}
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
