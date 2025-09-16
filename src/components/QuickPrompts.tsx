import { useRef, useEffect } from "react";

interface QuickPromptsProps {
  quickPrompts: Array<{ label: string; prompt: string }>;
  onTriggerPrompt: (prompt: string) => void;
}

export function QuickPrompts({ quickPrompts, onTriggerPrompt }: QuickPromptsProps) {
  /** Ping-pong Marquee — slower */
  const MarqueePingPong: React.FC<{
    items: typeof quickPrompts;
    duration?: number; // seconds for a full center→edge→other edge cycle
    delay?: number;    // negative offsets allowed to desync rows
  }> = ({ items, duration = 60, delay = 0 }) => { // SLOW default
    const setRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const update = () => {
        const w = setRef.current?.getBoundingClientRect().width ?? 600;
        trackRef.current?.style.setProperty("--setW", `${Math.ceil(w)}px`);
        trackRef.current?.style.setProperty("--dur", `${duration}s`);
        trackRef.current?.style.setProperty("--delay", `${delay}s`);
      };
      update();
      const ro = new ResizeObserver(update);
      if (setRef.current) ro.observe(setRef.current);
      window.addEventListener("resize", update);
      return () => {
        ro.disconnect();
        window.removeEventListener("resize", update);
      };
    }, [items, duration, delay]);

    return (
      <div className="marquee-ping">
        <div ref={trackRef} className="marquee-ping-track">
          {/* LEFT CLONE (A) */}
          <div className="marquee-ping-set" aria-hidden>
            {items.map((p, i) => (
              <button key={`L-${i}`} onClick={() => onTriggerPrompt(p.prompt)} className="prompt-pill">
                <span className="font-medium text-sm">{p.label}</span>
              </button>
            ))}
          </div>
          {/* CENTER (B) — measured */}
          <div ref={setRef} className="marquee-ping-set">
            {items.map((p, i) => (
              <button key={`C-${i}`} onClick={() => onTriggerPrompt(p.prompt)} className="prompt-pill">
                <span className="font-medium text-sm">{p.label}</span>
              </button>
            ))}
          </div>
          {/* RIGHT CLONE (C) */}
          <div className="marquee-ping-set" aria-hidden>
            {items.map((p, i) => (
              <button key={`R-${i}`} onClick={() => onTriggerPrompt(p.prompt)} className="prompt-pill">
                <span className="font-medium text-sm">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6 mb-16">
      <MarqueePingPong items={quickPrompts.slice(0, 6)} duration={68} />
      <MarqueePingPong items={quickPrompts.slice(6)} duration={80} delay={-12} />
    </div>
  );
}