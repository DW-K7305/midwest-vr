import { Routes, Route, Navigate } from "react-router-dom";
import { TitleBar } from "@/components/TitleBar";
import { Sidebar } from "@/components/Sidebar";
import { Dashboard } from "@/pages/Dashboard";
import { Connect } from "@/pages/Connect";
import { Discover } from "@/pages/Discover";
import { Stores } from "@/pages/Stores";
import { Apps } from "@/pages/Apps";
import { Kiosk } from "@/pages/Kiosk";
import { LauncherPage } from "@/pages/Launcher";
import { Setup } from "@/pages/Setup";
import { WifiPage } from "@/pages/WiFi";
import { Wireless } from "@/pages/Wireless";
import { SettingsPage } from "@/pages/Settings";
import { ToastViewport } from "@/components/ui/toast";
import { WelcomeTour } from "@/components/WelcomeTour";

export default function App() {
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
            <Route path="/kiosk" element={<Kiosk />} />
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
