import * as React from "react";
import { MetalFx } from "metal-fx";
import {
  checkMetalFxSupport, disableMetalFx, getMetalFxSupport,
  isMetalFxInitializationError, subscribeMetalFxSupport,
} from "@/lib/metalFxSupport";

type MetalFxProps = React.ComponentPropsWithoutRef<typeof MetalFx>;
const getServerSnapshot = () => false;

/** Same host/content shape and caller styles, with a static, non-interactive rim. */
const StaticMetalFx = React.forwardRef<HTMLDivElement, MetalFxProps>((props, ref) => {
  const { children, className, style, borderRadius, variant, strength = 1, theme } = props;
  const hostProps = { ...props };
  for (const name of [
    "children", "className", "style", "variant", "preset", "theme", "strength", "paused",
    "borderRadius", "normalizeHostStyles", "reflectionTargets", "disableGlow",
    "shaderScale", "ringCssPx", "scale",
  ] as const) delete hostProps[name];

  return (
    <div
      {...hostProps}
      ref={ref}
      className={["metal-fx-fallback", className].filter(Boolean).join(" ")}
      data-metal-fx-fallback="true"
      data-theme={theme}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: variant === "circle" ? "50%" : borderRadius ?? "inherit", ...style }}
    >
      <span aria-hidden="true" style={{
        position: "absolute", inset: 0, borderRadius: "inherit", pointerEvents: "none",
        opacity: Math.min(1, Math.max(0, strength)),
        boxShadow: "inset 0 0 0 1px hsl(var(--foreground) / 0.25)",
      }} />
      <div className="metal-fx-content">{children}</div>
    </div>
  );
});
StaticMetalFx.displayName = "StaticMetalFx";

class MetalFxBoundary extends React.Component<{
  children: React.ReactNode;
  fallback: React.ReactNode;
}, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(error: unknown) {
    // Application/child errors still reach the application's error boundary.
    if (!isMetalFxInitializationError(error)) throw error;
    return { failed: true };
  }

  componentDidCatch() {
    // A probe cannot guarantee shader initialization. Switch existing and later
    // decorations to static too, instead of repeatedly allocating failing renderers.
    disableMetalFx();
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Keep decorative WebGL optional; leave auth, chat and voice behavior untouched. */
export const SafeMetalFx = React.forwardRef<HTMLDivElement, MetalFxProps>((props, ref) => {
  const supported = React.useSyncExternalStore(subscribeMetalFxSupport, getMetalFxSupport, getServerSnapshot);
  React.useEffect(checkMetalFxSupport, []);
  const fallback = <StaticMetalFx {...props} ref={ref} />;
  if (!supported) return fallback;
  return (
    <MetalFxBoundary fallback={fallback}>
      <MetalFx {...props} ref={ref} />
    </MetalFxBoundary>
  );
});
SafeMetalFx.displayName = "SafeMetalFx";
