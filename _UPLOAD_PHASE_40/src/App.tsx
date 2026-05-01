import { useEffect, useRef } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { TitleBar } from "@/components/TitleBar";
import { Sidebar } from "@/components/Sidebar";
import { api } from "@/lib/tauri";
import { Dashboard } from "@/pages/Dashboard";
import { Connect } from "@/pages/Connect";
import { Discover } from "@/pages/Discover";
import { Stores } from "@/pages/Stores";
import { Apps } from "@/pages/Apps";
import { ClassMode } from "@/pages/ClassMode";
import { LauncherPage } from "@/pages/Launcher";
import { Profiles } from "@/pages/Profiles";
import { Setup } from "@/pages/Setup";
import { WifiPage } from "@/pages/WiFi";
import { Wireless } from "@/pages/Wireless";
import { SettingsPage } from "@/pages/Settings";
import { ToastViewport } from "@/components/ui/toast";
import { WelcomeTour } from "@/components/WelcomeTour";

export default function App() {
  // Self-healing wireless: every time the user comes back to this app
  // (window focus or tab visibility), try to reconnect every paired
  // headset. Combined with the 8-30s background loop in Rust, this means
  // that a headset that went to sleep while the user was off doing other
  // things shows up online within a second of the user clicking back into
  // the app. We rate-limit to once per 2s so frantic alt-tabbing doesn't
  // spam adb.
  const lastReconnect = useRef(0);
  useEffect(() => {
    function maybeReconnect() {
      const now = Date.now();
      if (now - lastReconnect.current < 2000) return;
      lastReconnect.current = now;
      api.wirelessReconnectAll().catch(() => {
        /* silent — the background loop will retry */
      });
    }
    function onVisibility() {
      if (document.visibilityState === "visible") maybeReconnect();
    }
    window.addEventListener("focus", maybeReconnect);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", maybeReconnect);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-background">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/connect" element={<Connect />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/discover" element={<Discover />} />
            <Route path="/stores" element={<Stores />} />
            <Route path="/apps" element={<Apps />} />
            <Route path="/launcher" element={<LauncherPage />} />
            <Route path="/class-mode" element={<ClassMode />} />
            <Route path="/profiles" element={<Profiles />} />
            {/* Old /kiosk URLs (e.g. user bookmarks) redirect to the new page. */}
            <Route path="/kiosk" element={<Navigate to="/class-mode" replace />} />
            <Route path="/wifi" element={<WifiPage />} />
            <Route path="/wireless" element={<Wireless />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <ToastViewport />
      <WelcomeTour />
    </div>
  );
}
