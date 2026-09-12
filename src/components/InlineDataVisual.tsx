import * as React from "react";

import { cn } from "@/lib/utils";

export type ProgressPoint = {
  label: string;
  value: number;
  detail?: string;
};

export type InlineProgressVisualProps = {
  data: readonly ProgressPoint[];
  max?: number;
  unit?: string;
  title?: string;
  compact?: boolean;
  className?: string;
  formatValue?: (value: number, point: ProgressPoint) => string;
};

export type InlineHumidityVisualProps = {
  value: number;
  label?: string;
  unit?: string;
  title?: string;
  compact?: boolean;
  className?: string;
  segments?: number;
  onChange?: (value: number) => void;
};

export type InlineDataVisualProps =
  | ({ type: "progress" } & InlineProgressVisualProps)
  | ({ type: "humidity" } & InlineHumidityVisualProps);

const visualStyles = `
  [data-inline-data-visual] {
    --inline-accent: 160 84% 58%;
  }

  [data-inline-data-visual] [data-visual-target] {
    transition: opacity 180ms ease, transform 180ms ease, stroke 180ms ease, fill 180ms ease;
  }

  [data-inline-data-visual] [data-visual-target]:focus-visible {
    outline: none;
    filter: drop-shadow(0 0 5px hsl(var(--inline-accent) / 0.72));
  }

  [data-inline-data-visual] [data-visual-value] {
    animation: inline-data-value-in 220ms ease-out both;
  }

  @keyframes inline-data-value-in {
    from { opacity: 0; transform: translateY(3px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-inline-data-visual] *,
    [data-inline-data-visual] *::before,
    [data-inline-data-visual] *::after {
      animation: none !important;
      transition: none !important;
    }
  }
`;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDefaultValue(value: number, unit: string) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${unit}`;
}

function VisualFrame({
  children,
  className,
  compact,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  title: string;
}) {
  return (
    <section
      data-inline-data-visual
      aria-label={title}
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-white/[0.09] bg-black/[0.52] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_14px_36px_rgba(0,0,0,0.2)] backdrop-blur-xl",
        compact ? "min-h-[132px] p-3" : "min-h-[176px] p-4",
        className,
      )}
    >
      <style>{visualStyles}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.06),transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.025),transparent_48%)]"
      />
      {children}
    </section>
  );
}

function ProgressVisual({
  data,
  max,
  unit = "",
  title = "Progress",
  compact = false,
  className,
  formatValue = (value) => formatDefaultValue(value, unit),
}: InlineProgressVisualProps) {
  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);
  const safeData = data.slice(0, 32);
  const resolvedMax = Math.max(max ?? Math.max(...safeData.map((point) => point.value), 1), 1);
  const selectedIndex = activeIndex ?? Math.max(safeData.length - 1, 0);
  const selectedPoint = safeData[selectedIndex];
  const selectedValue = selectedPoint ? formatValue(selectedPoint.value, selectedPoint) : "—";

  return (
    <VisualFrame title={title} compact={compact} className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
          <p data-visual-value key={`${selectedPoint?.label ?? "empty"}-${selectedPoint?.value ?? "empty"}`} className="mt-1 text-xl font-medium tracking-tight text-foreground">
            {selectedValue}
          </p>
        </div>
        {selectedPoint && (
          <div className="shrink-0 text-right">
            <p className="pt-1 text-xs text-muted-foreground">{selectedPoint.label}</p>
            {selectedPoint.detail && <p className="mt-0.5 max-w-[130px] truncate text-[10px] text-muted-foreground/70">{selectedPoint.detail}</p>}
          </div>
        )}
      </div>

      <div className={cn("relative mt-3", compact ? "h-[64px]" : "h-[90px]")}>
        {safeData.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">No data yet</div>
        ) : (
          <>
            <svg viewBox="0 0 360 110" className="h-full w-full overflow-visible" role="img" aria-label={`${title} progress ticks`}>
              <line x1="20" x2="340" y1="84" y2="84" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
              {safeData.map((point, index) => {
                const step = 320 / safeData.length;
                const barWidth = Math.max(3, Math.min(11, step - 3));
                const x = 20 + index * step + (step - barWidth) / 2;
                const height = 18 + (clamp(point.value, 0, resolvedMax) / resolvedMax) * 48;
                const isSelected = index === selectedIndex;
                return (
                  <rect
                    key={`${point.label}-${index}`}
                    x={x}
                    y={84 - height}
                    width={barWidth}
                    height={height}
                    rx={barWidth / 2}
                    fill={isSelected ? "hsl(var(--inline-accent))" : "hsl(var(--inline-accent) / 0.34)"}
                    data-visual-target
                    data-tick
                  />
                );
              })}
            </svg>
            {safeData.map((point, index) => {
              const left = ((index + 0.5) / safeData.length) * 100;
              return (
                <button
                  key={`hit-${point.label}-${index}`}
                  type="button"
                  data-visual-target
                  aria-label={`${point.label}: ${formatValue(point.value, point)}`}
                  className="absolute inset-y-0 -translate-x-1/2 rounded-md focus-visible:ring-2 focus-visible:ring-[hsl(var(--inline-accent))] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                  style={{ left: `${left}%`, width: `${Math.max(100 / safeData.length, 8)}%` }}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                />
              );
            })}
          </>
        )}
      </div>
    </VisualFrame>
  );
}

const HUMIDITY_START_DEGREES = 120;
const HUMIDITY_SWEEP_DEGREES = 300;

function pointOnArc(center: number, radius: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: center + Math.cos(angle) * radius,
    y: center + Math.sin(angle) * radius,
  };
}

function arcPath(center: number, radius: number) {
  const start = pointOnArc(center, radius, HUMIDITY_START_DEGREES);
  const end = pointOnArc(center, radius, HUMIDITY_START_DEGREES + HUMIDITY_SWEEP_DEGREES);
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 1 1 ${end.x} ${end.y}`;
}

function valueFromPointer(event: React.PointerEvent<SVGPathElement>, center: number) {
  const svg = event.currentTarget.ownerSVGElement;
  if (!svg) return null;
  const bounds = svg.getBoundingClientRect();
  const scaleX = (center * 2) / bounds.width;
  const scaleY = (center * 2) / bounds.height;
  const x = (event.clientX - bounds.left) * scaleX;
  const y = (event.clientY - bounds.top) * scaleY;
  const degrees = ((Math.atan2(y - center, x - center) * 180) / Math.PI + 360) % 360;
  const delta = degrees < HUMIDITY_START_DEGREES ? degrees + 360 - HUMIDITY_START_DEGREES : degrees - HUMIDITY_START_DEGREES;
  return clamp((delta / HUMIDITY_SWEEP_DEGREES) * 100, 0, 100);
}

function HumidityVisual({
  value,
  label = "Humidity",
  unit = "%",
  title = "Humidity",
  compact = false,
  className,
  segments = 60,
  onChange,
}: InlineHumidityVisualProps) {
  const safeValue = clamp(value, 0, 100);
  const [interactiveValue, setInteractiveValue] = React.useState(safeValue);
  const [isInteracting, setIsInteracting] = React.useState(false);
  const pointerId = React.useRef<number | null>(null);
  const safeSegments = clamp(Math.round(segments), 24, 72);
  const center = compact ? 62 : 78;
  const radius = compact ? 43 : 55;
  const tickWidth = compact ? 2.6 : 3.2;
  const displayValue = isInteracting ? interactiveValue : safeValue;

  React.useEffect(() => {
    if (!isInteracting) setInteractiveValue(safeValue);
  }, [isInteracting, safeValue]);

  const commitValue = React.useCallback((nextValue: number) => {
    const next = Math.round(clamp(nextValue, 0, 100));
    setInteractiveValue(next);
    onChange?.(next);
  }, [onChange]);

  const handlePointerDown = (event: React.PointerEvent<SVGPathElement>) => {
    pointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsInteracting(true);
    const next = valueFromPointer(event, center);
    if (next !== null) commitValue(next);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGPathElement>) => {
    if (pointerId.current !== event.pointerId) return;
    const next = valueFromPointer(event, center);
    if (next !== null) commitValue(next);
  };

  const stopPointer = (event: React.PointerEvent<SVGPathElement>) => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setIsInteracting(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGPathElement>) => {
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = displayValue + 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = displayValue - 1;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = 100;
    if (next === null) return;
    event.preventDefault();
    setIsInteracting(true);
    commitValue(next);
  };

  return (
    <VisualFrame title={title} compact={compact} className={className}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
          <p data-visual-value key={`${Math.round(displayValue)}-${isInteracting}`} className="mt-1 text-xl font-medium tracking-tight text-foreground">
            {Math.round(displayValue)}{unit}
          </p>
        </div>
        <p className="pt-1 text-xs text-muted-foreground">{label}</p>
      </div>

      <div className="relative mt-1 flex justify-center">
        <svg
          viewBox={`0 0 ${center * 2} ${center * 2}`}
          className={cn("overflow-visible", compact ? "h-[92px] w-[92px]" : "h-[124px] w-[124px]")}
          role="img"
          aria-label={`${label}: ${Math.round(displayValue)}${unit}`}
        >
          <circle cx={center} cy={center} r={radius - 10} fill="none" stroke="rgba(255,255,255,0.045)" strokeWidth={1} />
          {Array.from({ length: safeSegments }, (_, index) => {
            const ratio = index / (safeSegments - 1);
            const angle = HUMIDITY_START_DEGREES + ratio * HUMIDITY_SWEEP_DEGREES;
            const innerPoint = pointOnArc(center, radius - 7, angle);
            const outerPoint = pointOnArc(center, radius, angle);
            const isActive = ratio <= displayValue / 100;
            return (
              <line
                key={index}
                x1={innerPoint.x}
                y1={innerPoint.y}
                x2={outerPoint.x}
                y2={outerPoint.y}
                stroke={isActive ? "hsl(var(--inline-accent) / 0.82)" : "rgba(255,255,255,0.16)"}
                strokeWidth={isActive ? tickWidth : tickWidth - 0.6}
                strokeLinecap="round"
                data-visual-target
                data-tick
              />
            );
          })}
          <path
            d={arcPath(center, radius)}
            fill="none"
            stroke="transparent"
            strokeWidth={20}
            strokeLinecap="round"
            pointerEvents="stroke"
            tabIndex={0}
            role="slider"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(displayValue)}
            aria-valuetext={`${Math.round(displayValue)}${unit}`}
            data-visual-target
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopPointer}
            onPointerCancel={stopPointer}
            onFocus={() => setIsInteracting(true)}
            onBlur={() => setIsInteracting(false)}
            onKeyDown={handleKeyDown}
          />
          <text x={center} y={center + 5} textAnchor="middle" className="fill-foreground text-[17px] font-medium">
            {Math.round(displayValue)}{unit}
          </text>
        </svg>
      </div>
    </VisualFrame>
  );
}

export function InlineProgressChart(props: InlineProgressVisualProps) {
  return <ProgressVisual {...props} />;
}

export function InlineHumidityWheel(props: InlineHumidityVisualProps) {
  return <HumidityVisual {...props} />;
}

export function InlineDataVisual(props: InlineDataVisualProps) {
  return props.type === "progress" ? <ProgressVisual {...props} /> : <HumidityVisual {...props} />;
}
