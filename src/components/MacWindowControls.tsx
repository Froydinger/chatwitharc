import React from "react";

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
 * GameCube-style window controls for the macOS desktop shell ONLY.
 * Rebuilt to match the 3D reference art (yellow kidney bean, green split-square resize, red close X).
 */

// Semicircular-capped annulus sector for the yellow kidney bean (212° to 252°, R_in=1.24, R_out=2.05)
const BEAN_PATH =
  "M -1.738,-1.087 " +
  "A 2.05,2.05 0 0 1 -0.634,-1.949 " +
  "A 0.405,0.405 0 0 1 -0.383,-1.179 " +
  "A 1.24,1.24 0 0 0 -1.052,-0.657 " +
  "A 0.405,0.405 0 0 1 -1.738,-1.087 Z";

const DASH = { x: -1.013, y: -1.296, w: 0.44, h: 0.125, rot: -8 };
const RED = { x: 1.70, y: 0.0, r: 0.52, arm: 0.17, stroke: 0.125 };
const GLYPH = { size: 0.48, radius: 0.07, gap: 0.08 };

// ViewBox accommodating the full cluster with margins
const VIEW = { x: -2.25, y: -2.45, w: 4.7, h: 3.6 };

export function MacWindowControls() {
  const bridge = getDesktopBridge();

  // ONLY render inside the macOS Mac Desktop Electron app
  if (bridge?.platform !== "darwin" || !bridge.windowControls) {
    return null;
  }

  const controls = bridge.windowControls;

  return (
    <div className="gamecube-window-controls" aria-label="Window controls">
      <svg
        className="gamecube-window-controls__art"
        viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
        aria-hidden="true"
      >
        <defs>
          {/* Yellow Kidney Bean Gradients & Filters */}
          <linearGradient id="gc-yellow-grad" x1="20%" y1="10%" x2="80%" y2="90%">
            <stop offset="0%" stopColor="#f9c84c" />
            <stop offset="50%" stopColor="#f1a329" />
            <stop offset="100%" stopColor="#d68010" />
          </linearGradient>
          <filter id="gc-yellow-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0.08" stdDeviation="0.07" floodColor="#352005" floodOpacity="0.4" />
          </filter>

          {/* Green Maximize Button Gradients & Filters */}
          <linearGradient id="gc-green-grad" x1="20%" y1="10%" x2="80%" y2="90%">
            <stop offset="0%" stopColor="#4ede6c" />
            <stop offset="50%" stopColor="#3cbe5a" />
            <stop offset="100%" stopColor="#259741" />
          </linearGradient>
          <filter id="gc-green-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0.08" stdDeviation="0.08" floodColor="#103418" floodOpacity="0.42" />
          </filter>

          {/* Red Close Button Gradients & Filters */}
          <linearGradient id="gc-red-grad" x1="20%" y1="10%" x2="80%" y2="90%">
            <stop offset="0%" stopColor="#f96660" />
            <stop offset="50%" stopColor="#ee4b45" />
            <stop offset="100%" stopColor="#cc322d" />
          </linearGradient>
          <filter id="gc-red-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="0.08" stdDeviation="0.07" floodColor="#3d0f0f" floodOpacity="0.42" />
          </filter>

          {/* Mask for diagonal split square icon inside green button */}
          <mask id="gc-maximize-mask">
            <rect
              x={-GLYPH.size / 2}
              y={-GLYPH.size / 2}
              width={GLYPH.size}
              height={GLYPH.size}
              rx={GLYPH.radius}
              fill="white"
            />
            <line
              x1={-GLYPH.size * 0.8}
              y1={GLYPH.size * 0.8}
              x2={GLYPH.size * 0.8}
              y2={-GLYPH.size * 0.8}
              stroke="black"
              strokeWidth={GLYPH.gap}
            />
          </mask>
        </defs>

        {/* Yellow Minimize Kidney Bean */}
        <g filter="url(#gc-yellow-shadow)">
          <path d={BEAN_PATH} fill="url(#gc-yellow-grad)" stroke="#cf7b0e" strokeWidth="0.035" />
          <rect
            x={DASH.x - DASH.w / 2}
            y={DASH.y - DASH.h / 2}
            width={DASH.w}
            height={DASH.h}
            rx={DASH.h / 2}
            fill="#452e07"
            transform={`rotate(${DASH.rot} ${DASH.x} ${DASH.y})`}
          />
        </g>

        {/* Green Maximize / Resize Button */}
        <g filter="url(#gc-green-shadow)">
          <circle cx={0} cy={0} r={1} fill="url(#gc-green-grad)" stroke="#228e3b" strokeWidth="0.035" />
          <rect
            x={-GLYPH.size / 2}
            y={-GLYPH.size / 2}
            width={GLYPH.size}
            height={GLYPH.size}
            rx={GLYPH.radius}
            fill="#134c24"
            mask="url(#gc-maximize-mask)"
          />
        </g>

        {/* Red Close Button */}
        <g filter="url(#gc-red-shadow)">
          <circle cx={RED.x} cy={RED.y} r={RED.r} fill="url(#gc-red-grad)" stroke="#b82824" strokeWidth="0.035" />
          <path
            d={`M ${RED.x - RED.arm},${RED.y - RED.arm} L ${RED.x + RED.arm},${RED.y + RED.arm} ` +
               `M ${RED.x + RED.arm},${RED.y - RED.arm} L ${RED.x - RED.arm},${RED.y + RED.arm}`}
            stroke="#5c1313"
            strokeWidth={RED.stroke}
            strokeLinecap="round"
            fill="none"
          />
        </g>
      </svg>

      {/* Hit targets for click interaction */}
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
