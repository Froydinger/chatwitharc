import { motion, PanInfo, useAnimation } from "framer-motion";
import { MessageCircle, Settings, History } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { useRef, useState, useEffect } from "react";
import { ChatInput } from "@/components/ChatInput";

const navigationItems = [
  { id: "chat", icon: MessageCircle },
  { id: "history", icon: History },
  { id: "settings", icon: Settings },
] as const;

export function BottomNavigation() {
  const { currentTab, setCurrentTab } = useArcStore();
  const [isDragging, setIsDragging] = useState(false);
  const bubbleControls = useAnimation();

  // Rail that contains BOTH the tabs and the bubble.
  const railRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);

  const BUBBLE = 48; // w-12 h-12 (smaller bubble)

  // Compute bubble x relative to the rail using offsetLeft.
  const getBubblePosition = () => {
    const ids = ["chat", "history", "settings"] as const;
    const idx = ids.findIndex((i) => i === currentTab);
    const tabEl = tabRefs.current[idx];
    const rail = railRef.current;

    if (!tabEl || !rail) {
      const CELL = 106.67; // fallback for 320px width / 3
      return { x: idx * CELL + (CELL - BUBBLE) / 2, y: -4 };
    }

    const tabCenterX = tabEl.offsetLeft + tabEl.offsetWidth / 2;
    const xWithinRail = tabCenterX - BUBBLE / 2;
    return { x: xWithinRail, y: -4 }; // slightly lowered
  };

  useEffect(() => {
    if (isDragging) return;
    const p = getBubblePosition();
    bubbleControls.start({
      x: p.x,
      y: p.y,
      transition: { type: "spring", damping: 12, stiffness: 300, mass: 0.6, duration: 0.3 },
    });
  }, [currentTab, isDragging, bubbleControls]);

  useEffect(() => {
    const setNow = () => {
      const p = getBubblePosition();
      bubbleControls.set({ x: p.x, y: p.y });
    };
    setNow();
    const t = setTimeout(setNow, 60);
    const onResize = () => setNow();
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    // Snap to closest tab horizontally.
    let best = 0;
    let dist = Infinity;
    tabRefs.current.forEach((el, i) => {
      if (!el) return;
      const center = el.getBoundingClientRect().left + el.offsetWidth / 2;
      const d = Math.abs(info.point.x - center);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    (["chat", "history", "settings"] as const)[best] &&
      setCurrentTab((["chat", "history", "settings"] as const)[best]);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative"
      >
        {/* Glass container (shorter overall) */}
        <motion.div
          className="relative flex flex-col items-center"
          animate={{
            paddingTop: currentTab === "chat" ? "0.5rem" : "0.5rem",
            paddingBottom: "0.5rem",
          }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          style={{
            background:
              "linear-gradient(135deg, hsla(240, 15%, 12%, 0.3) 0%, hsla(240, 20%, 15%, 0.4) 100%)",
            backdropFilter: "blur(20px)",
            borderRadius: "3rem",
            border: "1px solid hsla(240, 25%, 25%, 0.3)",
            boxShadow:
              "0 0 28px hsla(200,100%,70%,0.18), 0 6px 20px hsla(200,100%,60%,0.12), inset 0 1px 0 hsla(200,100%,80%,0.25), inset 0 -1px 0 hsla(200,100%,30%,0.18)",
            minWidth: 320,
            width: 320,
            ["--bubble-blue" as any]: "hsl(200, 100%, 60%)",
          }}
        >
          {/* Focus color override to match bubble blue */}
          <style>{`
            .chat-input-scope input:focus,
            .chat-input-scope input:focus-visible,
            .chat-input-scope textarea:focus,
            .chat-input-scope textarea:focus-visible {
              outline-color: var(--bubble-blue) !important;
              box-shadow: 0 0 0 3px color-mix(in oklab, var(--bubble-blue) 35%, transparent) !important;
              border-color: var(--bubble-blue) !important;
            }
            /* Lower the paperclip for baseline alignment */
            .chat-input-scope button:first-of-type { transform: translateY(5px); }
          `}</style>

          {/* Chat input */}
          {currentTab === "chat" && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.25 }}
              className="w-full px-6 mb-5 chat-input-scope"
            >
              <ChatInput />
            </motion.div>
          )}

          {/* Rail: bubble + 3 tab cells (icon-only) */}
          <div className="relative z-20" style={{ width: 320, height: 56 }}>
            <div
              ref={railRef}
              className="absolute inset-0 flex justify-between items-center px-4"
              style={{ width: 320, height: 56 }}
            >
              {(["chat", "history", "settings"] as const).map((id, index) => {
                const Icon = navigationItems[index].icon;
                const isActive = currentTab === id;
                return (
                  <div
                    key={id}
                    ref={(el) => (tabRefs.current[index] = el)}
                    className="flex items-center justify-center cursor-pointer select-none"
                    style={{ width: 64, height: 56 }}
                    onClick={() => setCurrentTab(id)}
                    aria-label={id}
                    title={id}
                  >
                    <Icon
                      className={`h-6 w-6 transition-colors duration-300 ${
                        isActive
                          ? "text-primary-foreground drop-shadow-lg"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Smaller, lower bubble */}
            <motion.div
              drag="x"
              dragMomentum
              dragElastic={0.4}
              dragConstraints={railRef}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDragEnd}
              animate={bubbleControls}
              initial={getBubblePosition()}
              whileHover={{ scale: 1.05, transition: { type: "spring", damping: 10, stiffness: 400 } }}
              whileDrag={{
                scale: 1.18,
                zIndex: 1000,
                filter:
                  "drop-shadow(0 0 24px hsla(200,100%,60%,0.8)) drop-shadow(0 0 48px hsla(200,100%,40%,0.5))",
                transition: { type: "spring", damping: 6, stiffness: 280 },
              }}
              className="absolute left-0 top-0 -translate-y-4 w-12 h-12 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto"
              style={{
                background:
                  "radial-gradient(circle at center, hsla(200,100%,80%,0.22) 0%, hsla(200,100%,50%,0.58) 100%)",
                backdropFilter: "blur(18px)",
                border: "2px solid hsla(200,100%,70%,0.7)",
                boxShadow:
                  "0 0 24px hsla(200,100%,60%,0.38), 0 6px 18px hsla(200,100%,50%,0.22), inset 0 2px 0 hsla(200,100%,90%,0.55), inset 0 -2px 0 hsla(200,100%,30%,0.35)",
              }}
            >
              <div className="absolute inset-1 rounded-full overflow-hidden">
                <div className="absolute top-1 left-1.5 w-4 h-0.5 bg-white opacity-70 blur-sm rounded-full" />
                <div className="absolute bottom-1 right-1 w-3 h-0.5 bg-blue-200 opacity-50 blur-sm rounded-full" />
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}