import { Routes, Route, Navigate } from "react-router-dom";
import { TitleBar } from "@/components/TitleBar";
import { Sidebar } from "@/components/Sidebar";
import { Dashboard } from "@/pages/Dashboard";
import { Connect } from "@/pages/Connect";
import { Apps } from "@/pages/Apps";
import { Kiosk } from "@/pages/Kiosk";
import { WifiPage } from "@/pages/WiFi";
import { SettingsPage } from "@/pages/Settings";
import { ToastViewport } from "@/components/ui/toast";

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
            <Route path="/apps" element={<Apps />} />
            <Route path="/kiosk" element={<Kiosk />} />
            <Route path="/wifi" element={<WifiPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <ToastViewport />
    </div>
  );
}
