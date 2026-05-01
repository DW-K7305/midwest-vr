/**
 * Custom macOS title bar.
 *
 * The window is configured with `titleBarStyle: "Overlay"` + `hiddenTitle: true`
 * + `trafficLightPosition`, so the system traffic lights are still drawn on
 * top of OUR title bar. We leave an 84px gutter on the left where they sit
 * and take over the rest as our brand row.
 *
 * Drag behavior — belt-and-suspenders:
 *
 * Tauri 2 ships a `data-tauri-drag-region` attribute that turns elements into
 * OS drag handles. In practice on Tauri 2 + macOS Tahoe, that attribute alone
 * has been flaky for some users (silently fails to bind the listener on certain
 * release builds). To make this work bulletproof, we ALSO attach a JS
 * `mousedown` handler that explicitly calls `getCurrentWindow().startDragging()`.
 * One of the two paths will catch every drag.
 *
 * Double-click on the bar toggles maximize, matching native macOS behavior.
 * We never start a drag for clicks on interactive children (button/a/input)
 * so the UI inside the bar still works.
 */

import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useDevices } from "@/hooks/useDevices";

/**
 * Build tag — visible in the title bar so the user can tell at a glance
 * which iteration of MidWest-VR they're running. Bump this every round
 * that ships changes. Format: "1.<phase number>".
 */
export const BUILD_TAG = "1.45";

export function TitleBar() {
  const { data: devices } = useDevices();
  const onlineCount = (devices ?? []).filter((d) => d.state === "device").length;

  // Tiny live clock — useful at-a-glance for teachers running classes.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    // Plain left-click only. Anything else (right-click, ctrl+click, etc.)
    // we let macOS handle.
    if (e.button !== 0) return;
    // Clicks on interactive children inside the bar must NOT start a drag.
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, [data-no-drag]")) {
      return;
    }
    // Double-click → toggle maximize, matching native macOS behavior.
    if (e.detail === 2) {
      try {
        const win = getCurrentWindow();
        const max = await win.isMaximized();
        if (max) await win.unmaximize();
        else await win.maximize();
      } catch {
        /* ignore — non-fatal */
      }
      return;
    }
    // Single-click on the empty bar → start window drag. Wrap in try so any
    // permission/IPC hiccup doesn't surface as a runtime error toast.
    try {
      await getCurrentWindow().startDragging();
    } catch {
      /* ignore */
    }
  }

  const timeStr = now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      className="h-11 flex items-center justify-between bg-background/60 backdrop-blur border-b border-border px-4 select-none"
      style={{ paddingLeft: 84 }}
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 text-sm font-medium text-foreground/80 pointer-events-none"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-primary" />
        MidWest-VR
        <span
          className="text-[11px] font-mono text-muted-foreground/70 ml-1"
          title="Build version — bumps every round of changes I ship. Use this to verify you're on the latest build."
        >
          v{BUILD_TAG}
        </span>
      </div>
      <div
        data-tauri-drag-region
        className="flex items-center gap-3 text-xs text-muted-foreground pointer-events-none"
      >
        <span className="flex items-center gap-1.5">
          <span
            className={
              "h-1.5 w-1.5 rounded-full " +
              (onlineCount > 0 ? "bg-emerald-500" : "bg-muted-foreground/40")
            }
          />
          {onlineCount} headset{onlineCount === 1 ? "" : "s"} online
        </span>
        <span className="text-muted-foreground/60">·</span>
        <span>{timeStr}</span>
      </div>
    </div>
  );
}
