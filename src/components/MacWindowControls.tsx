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

/**
 * GameCube-style window controls for the macOS desktop shell.
 *
 * All geometry below is expressed in units of the green button's radius, with
 * the origin at the green button's centre, so the whole cluster scales from
 * the single `--gamecube-r` value in index.css without any proportion drift.
 *
 * The yellow minimise button is a kidney: an annulus sector from 212° to 252°
 * spanning radius 1.24–2.05, with semicircular caps. It was matched to the
 * reference art by rendering candidates and comparing, not derived — a
 * uniform-thickness arc at the wrong inner radius reads as either a fat wedge
 * or a banana, and only this band lands on the intended bean.
 *
 * The cluster deliberately overhangs the window's rounded corner, which is why
 * the shell runs a transparent window and paints its own corner — see
 * desktop/arcai/main.js.
 */

const BEAN_PATH =
  "M -1.738,-1.087 " +
  "A 2.05,2.05 0 0 1 -0.634,-1.949 " +
  "A 0.405,0.405 0 0 1 -0.383,-1.179 " +
  "A 1.24,1.24 0 0 0 -1.052,-0.657 " +
  "A 0.405,0.405 0 0 1 -1.738,-1.087 Z";

// Centre of the minus glyph, at the kidney's mid-radius and mid-angle.
const DASH = { x: -1.013, y: -1.296, w: 0.443, h: 0.13, rot: -8 };
const RED = { x: 1.828, y: -0.005, r: 0.51, arm: 0.167, stroke: 0.125 };
const GLYPH = { size: 0.495, radius: 0.073, gap: 0.073 };

// Room for the cluster plus its stroke, in the same radius units.
const VIEW = { x: -2.45, y: -2.55, w: 5.0, h: 3.8 };

export function MacWindowControls() {
  const bridge = getDesktopBridge();
  if (bridge?.platform !== "darwin" || !bridge.windowControls) return null;

  const controls = bridge.windowControls;

  return (
    <div className="gamecube-window-controls" aria-label="Window controls">
      <svg
        className="gamecube-window-controls__art"
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
        aria-hidden="true"
      >
        <path d={BEAN_PATH} className="gc-fill-minimize" />
        <rect
          x={DASH.x - DASH.w / 2}
          y={DASH.y - DASH.h / 2}
          width={DASH.w}
          height={DASH.h}
          rx={DASH.h / 2}
          className="gc-symbol-minimize"
          transform={`rotate(${DASH.rot} ${DASH.x} ${DASH.y})`}
        />

        <circle cx={0} cy={0} r={1} className="gc-fill-maximize" />
        <rect
          x={-GLYPH.size / 2}
          y={-GLYPH.size / 2}
          width={GLYPH.size}
          height={GLYPH.size}
          rx={GLYPH.radius}
          className="gc-symbol-maximize"
        />
        <line
          x1={-GLYPH.size * 0.78}
          y1={GLYPH.size * 0.78}
          x2={GLYPH.size * 0.78}
          y2={-GLYPH.size * 0.78}
          className="gc-slash-maximize"
          strokeWidth={GLYPH.gap}
        />

        <circle cx={RED.x} cy={RED.y} r={RED.r} className="gc-fill-close" />
        <path
          d={`M ${RED.x - RED.arm},${RED.y - RED.arm} L ${RED.x + RED.arm},${RED.y + RED.arm} ` +
             `M ${RED.x + RED.arm},${RED.y - RED.arm} L ${RED.x - RED.arm},${RED.y + RED.arm}`}
          className="gc-symbol-close"
          strokeWidth={RED.stroke}
        />
      </svg>

      {/* Hit targets sit above the art so each button stays independently
          clickable without splitting the drawing into three SVGs. */}
      <button
        type="button"
        className="gamecube-hit gamecube-hit--minimize"
        aria-label="Minimize window"
        title="Minimize"
        onClick={() => void controls.minimize()}
      />
      <button
        type="button"
        className="gamecube-hit gamecube-hit--maximize"
        aria-label="Maximize or restore window"
        title="Maximize or restore"
        onClick={() => void controls.toggleMaximize()}
      />
      <button
        type="button"
        className="gamecube-hit gamecube-hit--close"
        aria-label="Close window"
        title="Close"
        onClick={() => void controls.close()}
      />
    </div>
  );
}
