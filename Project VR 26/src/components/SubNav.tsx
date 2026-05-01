/**
 * Generic horizontal sub-nav strip used by umbrella pages (Apps, Setup) to
 * expose their sub-views (Installed/Discover/Stores, etc.) without bloating
 * the sidebar. Reads the current pathname to highlight the active tab.
 */

import { NavLink } from "react-router-dom";
import {
  Boxes,
  Compass,
  Home,
  Plug,
  Radio,
  Sparkles,
  Store,
  Wifi,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SubNavItem {
  to: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  /** If set, this item is active for any of these path prefixes. */
  matchPrefixes?: string[];
  badge?: string | number | null;
}

interface Props {
  items: SubNavItem[];
}

/** Tabs shown on every page under the "Apps" umbrella. */
export const APPS_NAV: SubNavItem[] = [
  { to: "/apps", label: "Installed", icon: Boxes },
  { to: "/discover", label: "Browse Catalog", icon: Compass },
  { to: "/stores", label: "Stores", icon: Store },
];

/** Tabs shown on every page under the "Headset Setup" umbrella. */
export const SETUP_NAV: SubNavItem[] = [
  { to: "/setup", label: "Headset Wizard", icon: Sparkles },
  { to: "/connect", label: "First Connection", icon: Plug },
  { to: "/wifi", label: "Wi-Fi", icon: Wifi },
  { to: "/wireless", label: "Pair Wireless", icon: Radio },
  { to: "/launcher", label: "In-headset Launcher", icon: Home },
];

export function SubNav({ items }: Props) {
  return (
    <div className="border-b border-border bg-card/40 px-6">
      <div className="flex items-center gap-1 overflow-x-auto">
        {items.map(({ to, label, icon: Icon, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={to.endsWith("/")} /* exact match for "/foo/" base routes */
            className={({ isActive }) =>
              cn(
                "px-3 py-2.5 text-sm border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap",
                isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )
            }
          >
            {Icon && <Icon className="h-3.5 w-3.5" />}
            {label}
            {badge != null && badge !== "" && (
              <span className="ml-1 text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
