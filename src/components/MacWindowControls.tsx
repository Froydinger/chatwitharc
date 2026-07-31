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
 * GameCube-style window controls matching Reference Image 2:
 * - Yellow kidney bean tightly wrapping the top-left of the green button
 * - Tactile 3D Green button with diagonal split-square resize icon
 * - Red close button with dark burgundy X icon
 */

// Yellow kidney bean geometry (inner R=1.08, outer R=1.76, angle 212° to 252°)
const BEAN_PATH =
  "M -1.492,-0.933 " +
  "A 1.76,1.76 0 0 1 -0.544,-1.674 " +
  "A 0.34,0.34 0 0 1 -0.334,-1.027 " +
  "A 1.08,1.08 0 0 0 -0.916,-0.572 " +
  "A 0.34,0.34 0 0 1 -1.492,-0.933 Z";

// Minus bar on yellow bean: center (-0.874, -1.119), rotated -38deg
const DASH = { x: -0.874, y: -1.119, w: 0.44, h: 0.13, rot: -38 };

// Red button: center (1.58, 0), radius 0.46
const RED = { x: 1.58, y: 0.0, r: 0.46, arm: 0.15, stroke: 0.12 };

// Green button icon: square size 0.52, rx 0.08
const GLYPH = { size: 0.52, radius: 0.08, gap: 0.07 };

// SVG ViewBox
const VIEW = { x: -2.0, y: -2.1, w: 4.2, h: 3.2 };

export function MacWindowControls() {
  const bridge = getDesktopBridge();

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
          {/* Yellow Kidney Bean Gradients & Filter */}
          <linearGradient id="gc-yellow-grad" x1="30%" y1="10%" x2="70%" y2="90%">
            <stop offset="0%" stopColor="#fbc84c" />
            <stop offset="55%" stopColor="#f3a228" />
            <stop offset="100%" stopColor="#d57e0e" />
          </linearGradient>
          <filter id="gc-yellow-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0.05" stdDeviation="0.05" floodColor="#2a1803" floodOpacity="0.45" />
          </filter>

          {/* Green Maximize Button Gradients & Filter */}
          <linearGradient id="gc-green-grad" x1="30%" y1="10%" x2="70%" y2="90%">
            <stop offset="0%" stopColor="#4fdf6d" />
            <stop offset="50%" stopColor="#37c656" />
            <stop offset="100%" stopColor="#1fa241" />
          </linearGradient>
          <filter id="gc-green-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0.06" stdDeviation="0.06" floodColor="#0d3115" floodOpacity="0.45" />
          </filter>

          {/* Red Close Button Gradients & Filter */}
          <linearGradient id="gc-red-grad" x1="30%" y1="10%" x2="70%" y2="90%">
            <stop offset="0%" stopColor="#ff5c56" />
            <stop offset="50%" stopColor="#f04741" />
            <stop offset="100%" stopColor="#cb2d28" />
          </linearGradient>
          <filter id="gc-red-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="0.05" stdDeviation="0.05" floodColor="#380c0a" floodOpacity="0.45" />
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
              y1={-GLYPH.size * 0.8}
              x2={GLYPH.size * 0.8}
              y2={GLYPH.size * 0.8}
              stroke="black"
              strokeWidth={GLYPH.gap}
            />
          </mask>
        </defs>

        {/* Yellow Minimize Kidney Bean */}
        <g filter="url(#gc-yellow-shadow)">
          <path d={BEAN_PATH} fill="url(#gc-yellow-grad)" stroke="#cc770c" strokeWidth="0.03" />
          <rect
            x={DASH.x - DASH.w / 2}
            y={DASH.y - DASH.h / 2}
            width={DASH.w}
            height={DASH.h}
            rx={DASH.h / 2}
            fill="#3a2403"
            transform={`rotate(${DASH.rot} ${DASH.x} ${DASH.y})`}
          />
        </g>

        {/* Green Maximize / Resize Button */}
        <g filter="url(#gc-green-shadow)">
          <circle cx={0} cy={0} r={1} fill="url(#gc-green-grad)" stroke="#1a8936" strokeWidth="0.03" />
          <rect
            x={-GLYPH.size / 2}
            y={-GLYPH.size / 2}
            width={GLYPH.size}
            height={GLYPH.size}
            rx={GLYPH.radius}
            fill="#0c3817"
            mask="url(#gc-maximize-mask)"
          />
        </g>

        {/* Red Close Button */}
        <g filter="url(#gc-red-shadow)">
          <circle cx={RED.x} cy={RED.y} r={RED.r} fill="url(#gc-red-grad)" stroke="#b5221d" strokeWidth="0.03" />
          <path
            d={`M ${RED.x - RED.arm},${RED.y - RED.arm} L ${RED.x + RED.arm},${RED.y + RED.arm} ` +
               `M ${RED.x + RED.arm},${RED.y - RED.arm} L ${RED.x - RED.arm},${RED.y + RED.arm}`}
            stroke="#4d0e0c"
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
