/**
 * Sidebar — 5 top-level workflows, deliberately minimal.
 *
 * Each top-level item is a real day-to-day workflow, not a single screen.
 * Sub-views (e.g. Apps → Discover, Setup → Wi-Fi) are reachable by sub-nav
 * inside the umbrella page so the sidebar stays uncluttered. All the old
 * routes still resolve (so bookmarks don't break) and active-state matching
 * is path-prefix so the sub-routes still highlight the correct top-level item.
 */

import { NavLink, useLocation } from "react-router-dom";
import {
  Activity,
  Boxes,
  GraduationCap,
  Sparkles,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDevices } from "@/hooks/useDevices";

interface NavEntry {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Active when the current path STARTS WITH any of these prefixes. */
  matchPrefixes: string[];
}

const NAV: NavEntry[] = [
  {
    to: "/",
    label: "Dashboard",
    icon: Activity,
    matchPrefixes: ["/"],
  },
  {
    to: "/class-mode",
    label: "Class Mode",
    icon: GraduationCap,
    matchPrefixes: ["/class-mode", "/kiosk"],
  },
  {
    to: "/apps",
    label: "Apps",
    icon: Boxes,
    // Apps umbrella absorbs Discover + Stores via sub-nav.
    matchPrefixes: ["/apps", "/discover", "/stores"],
  },
  {
    to: "/setup",
    label: "Headset Setup",
    icon: Sparkles,
    // Setup umbrella absorbs Connect, Wi-Fi, Wireless ADB, Launcher push.
    matchPrefixes: ["/setup", "/connect", "/wifi", "/wireless", "/launcher"],
  },
  {
    to: "/settings",
    label: "Settings",
    icon: SettingsIcon,
    matchPrefixes: ["/settings"],
  },
];

export function Sidebar() {
  const { data: devices } = useDevices();
  const onlineCount = devices?.filter((d) => d.state === "device").length ?? 0;
  const totalCount = devices?.length ?? 0;
  const { pathname } = useLocation();

  return (
    <nav className="w-56 shrink-0 border-r border-border bg-card/30 flex flex-col">
      <div className="px-4 pt-4 pb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        MidWest-VR
      </div>
      <ul className="px-2 space-y-0.5 flex-1">
        {NAV.map(({ to, label, icon: Icon, matchPrefixes }) => {
          // Custom active-state: Dashboard is active ONLY on "/", but every
          // other entry is active when the path starts with any of its
          // prefixes (so /discover highlights Apps, /wifi highlights Setup).
          const active =
            to === "/"
              ? pathname === "/"
              : matchPrefixes.some(
                  (p) => p !== "/" && pathname.startsWith(p)
                );
          return (
            <li key={to}>
              <NavLink
                to={to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/15 text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
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
