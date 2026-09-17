import { useEffect, useState } from "react";
import { clearNavMark, readNavMark } from "@/lib/navPerf";

/**
 * Navigation probe for the iOS dashboard path. The node stays mounted so the
 * runtime/compositor path remains identical to the diagnostic build, while
 * the badge itself is fully transparent and hidden from assistive technology.
 */
export function DashboardNavTiming({ enabled }: { enabled: boolean }) {
  const [arrival] = useState(() => {
    const mark = readNavMark();
    return mark
      ? { mark, render: Math.round(performance.now() - mark.startedAt) }
      : null;
  });
  const [frame, setFrame] = useState<number | null>(null);

  useEffect(() => {
    if (!arrival) return;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setFrame(Math.round(performance.now() - arrival.mark.startedAt));
        if (readNavMark() === arrival.mark) clearNavMark();
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [arrival]);

  if (!enabled || !arrival) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-2 z-[100] rounded-md bg-black/80 px-2 py-1 font-mono text-[10px] leading-tight text-lime-300 opacity-0"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 4px)" }}
    >
      {arrival.mark.label}: render {arrival.render}ms · frame {frame ?? "…"}ms
    </div>
  );
}
