/**
 * Custom macOS title bar.
 *
 * The window is configured with `titleBarStyle: "Overlay"` + `hiddenTitle: true`
 * + `trafficLightPosition`, so the system traffic lights are still drawn on
 * top of OUR title bar — we leave an 84px gutter on the left where they sit
 * and take over the rest as our brand row.
 *
 * Why `data-tauri-drag-region`:
 *   Tauri 2 dropped reliance on the legacy `-webkit-app-region: drag` CSS in
 *   favor of a custom HTML attribute. Any element with this attribute (and
 *   any non-interactive child) becomes the OS drag handle for the window.
 *   We add it to the outer wrapper here so the entire bar — except the
 *   interactive subtitle text — is grabbable.
 */
export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="h-11 flex items-center justify-between bg-background/60 backdrop-blur border-b border-border px-4 select-none"
      style={{ paddingLeft: 84 }}
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2 text-sm font-medium text-foreground/80 pointer-events-none"
      >
        <span className="inline-block h-2 w-2 rounded-full bg-primary" />
        MidWest-VR
      </div>
      <div
        data-tauri-drag-region
        className="text-xs text-muted-foreground pointer-events-none"
      >
        Local fleet manager
      </div>
    </div>
  );
}
