/**
 * Custom macOS title bar. The window itself is decoration:overlay + hiddenTitle,
 * so the system traffic lights are still drawn — we just leave a 70px gutter
 * where they appear and put our own brand mark next to them.
 */
export function TitleBar() {
  return (
    <div
      className="titlebar-drag h-11 flex items-center justify-between bg-background/60 backdrop-blur border-b border-border px-4"
      style={{ paddingLeft: 84 }}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/80">
        <span className="inline-block h-2 w-2 rounded-full bg-primary" />
        MidWest-VR
      </div>
      <div className="text-xs text-muted-foreground titlebar-no-drag select-text">
        Local fleet manager
      </div>
    </div>
  );
}
