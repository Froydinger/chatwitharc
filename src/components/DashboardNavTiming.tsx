import { useEffect, useState } from "react";
import { clearNavMark, readNavMark } from "@/lib/navPerf";

export function DashboardNavTiming({ enabled }: { enabled: boolean }) {
  const [arrival] = useState(() => {
    const mark = readNavMark();
    return mark ? { mark, render: Math.round(performance.now() - mark.startedAt) } : null;
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
    <div className="fixed left-2 z-[100] rounded-md bg-black/80 px-2 py-1 font-mono text-[10px] leading-tight text-lime-300 pointer-events-none"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 4px)" }}>
      {arrival.mark.label}: render {arrival.render}ms · frame {frame ?? "…"}ms
    </div>
  );
}
