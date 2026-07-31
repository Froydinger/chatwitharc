type WindowControlResult = Promise<{ ok: boolean; maximized?: boolean }>;

type DesktopBridge = {
  platform?: string;
  windowControls?: {
    minimize: () => WindowControlResult;
    toggleMaximize: () => WindowControlResult;
    close: () => WindowControlResult;
  };
};

function getDesktopBridge(): DesktopBridge | undefined {
  return (window as Window & { arcaiDesktop?: DesktopBridge }).arcaiDesktop;
}

export function MacWindowControls() {
  const bridge = getDesktopBridge();
  if (bridge?.platform !== "darwin" || !bridge.windowControls) return null;

  return (
    <div className="gamecube-window-controls" aria-label="Window controls">
      <button
        type="button"
        className="gamecube-window-control gamecube-window-control--minimize"
        aria-label="Minimize window"
        title="Minimize"
        onClick={() => void bridge.windowControls?.minimize()}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <rect className="gamecube-window-symbol" x="35" y="41" width="30" height="18" rx="9" />
        </svg>
      </button>

      <button
        type="button"
        className="gamecube-window-control gamecube-window-control--maximize"
        aria-label="Maximize or restore window"
        title="Maximize or restore"
        onClick={() => void bridge.windowControls?.toggleMaximize()}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <mask id="gamecube-maximize-cutout">
              <rect x="34" y="34" width="32" height="32" rx="6" fill="white" />
              <path d="M31 69 69 31" stroke="black" strokeWidth="9" />
            </mask>
          </defs>
          <rect
            className="gamecube-window-symbol"
            x="34"
            y="34"
            width="32"
            height="32"
            rx="6"
            mask="url(#gamecube-maximize-cutout)"
          />
        </svg>
      </button>

      <button
        type="button"
        className="gamecube-window-control gamecube-window-control--close"
        aria-label="Close window"
        title="Close"
        onClick={() => void bridge.windowControls?.close()}
      >
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <path className="gamecube-window-symbol" d="M30 30 70 70M70 30 30 70" />
        </svg>
      </button>
    </div>
  );
}
