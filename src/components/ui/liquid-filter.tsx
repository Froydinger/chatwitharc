/**
 * LiquidFilter
 *
 * Mounts a single off-screen SVG <filter> definition used by the
 * CSS-only liquid glass system in index.css. The filter is referenced
 * via `filter: url(#liquid-edge)` on rim pseudo-elements.
 *
 * Skipped on iPad PWA (`.is-ipad`) via CSS to avoid compositor stress —
 * the element is still mounted but the rule that uses the filter is no-op.
 */
export function LiquidFilter() {
  return (
    <svg
      aria-hidden
      focusable="false"
      style={{
        position: "absolute",
        width: 0,
        height: 0,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <defs>
        {/* Subtle rim displacement — fakes light bending at the edge */}
        <filter id="liquid-edge" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.018"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="6"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Stronger version for big surfaces like the dock / modals */}
        <filter id="liquid-edge-strong" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.014"
            numOctaves="2"
            seed="13"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="10"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
