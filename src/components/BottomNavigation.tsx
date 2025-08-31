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

  // The 320px rail that contains BOTH the tabs and the bubble.
  const railRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);

  const BUBBLE = 56; // w-14 h-14 (smaller bubble)

  // Compute bubble x relative to the rail using offsetLeft (no viewport math).
  const getBubblePosition = () => {
    const idx = navigationItems.findIndex(i => i.id === currentTab);
    const tabEl = tabRefs.current[idx];
    const rail = railRef.current;

    if (!tabEl || !rail) {
      // Fallback: cells are ~106px wide in 320px container
      const CELL = 106.67;
      return { x: idx * CELL + (CELL - BUBBLE) / 2, y: -6 };
    }

    const tabCenterX = tabEl.offsetLeft + tabEl.offsetWidth / 2;
    const xWithinRail = tabCenterX - BUBBLE / 2; // rail is the offset parent
    return { x: xWithinRail, y: -6 };
  };

  useEffect(() => {
    if (isDragging) return;
    const p = getBubblePosition();
    bubbleControls.start({
      x: p.x,
      y: p.y,
      transition: { type: "spring", damping: 12, stiffness: 300, mass: 0.6, duration: 0.35 },
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
      const d = Math.abs(info.point.x - (el.getBoundingClientRect().left + el.offsetWidth / 2));
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
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
        {/* Glass container */}
        <motion.div
          className="relative flex flex-col items-center"
          animate={{
            // Move content up slightly when chat is active to create more space above the tabs
            paddingTop: currentTab === "chat" ? "1rem" : "0.75rem",
            paddingBottom: "0.75rem",
          }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{
            background:
              "linear-gradient(135deg, hsla(240, 15%, 12%, 0.3) 0%, hsla(240, 20%, 15%, 0.4) 100%)",
            backdropFilter: "blur(20px)",
            borderRadius: "3rem",
            border: "1px solid hsla(240, 25%, 25%, 0.3)",
            boxShadow: `
              0 0 40px hsla(200, 100%, 70%, 0.2),
              0 8px 32px hsla(200, 100%, 60%, 0.15),
              inset 0 1px 0 hsla(200, 100%, 80%, 0.3),
              inset 0 -1px 0 hsla(200, 100%, 30%, 0.2)
            `,
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
            /* Lower the existing paperclip (leftmost attach button) a bit for alignment */
            .chat-input-scope button:first-of-type { transform: translateY(5px); }
          `}</style>

          {/* Chat input */}
          {currentTab === "chat" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="w-full px-6 mb-8 chat-input-scope"
            >
              <ChatInput />
            </motion.div>
          )}

          {/* Rail: this contains BOTH the bubble (absolute) and the 3 tab cells */}
          <div className="relative z-20" style={{ width: 320, height: 64 }}>
            {/* Tabs grid (icon-only) */}
            <div
              ref={railRef}
              className="absolute inset-0 flex justify-between items-center px-4"
              style={{ width: 320, height: 64 }}
            >
              {(["chat", "history", "settings"] as const).map((id, index) => {
                const Icon = navigationItems[index].icon;
                const isActive = currentTab === id;
                return (
                  <div
                    key={id}
                    ref={(el) => (tabRefs.current[index] = el)}
                    className="flex items-center justify-center cursor-pointer select-none"
                    style={{ width: 64, height: 64 }}
                    onClick={() => setCurrentTab(id)}
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

            {/* Bubble now absolutely positioned INSIDE the rail */}
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
                scale: 1.2,
                zIndex: 1000,
                filter:
                  "drop-shadow(0 0 30px hsla(200, 100%, 60%, 0.9)) drop-shadow(0 0 60px hsla(200, 100%, 40%, 0.6))",
                transition: { type: "spring", damping: 6, stiffness: 280 },
              }}
              className="absolute left-0 top-0 -translate-y-6 w-14 h-14 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto"
              style={{
                background:
                  "radial-gradient(circle at center, hsla(200, 100%, 80%, 0.2) 0%, hsla(200, 100%, 50%, 0.6) 100%)",
                backdropFilter: "blur(20px)",
                border: "2px solid hsla(200, 100%, 70%, 0.7)",
              }}
            >
              <div className="absolute inset-1 rounded-full overflow-hidden">
                <div className="absolute top-1 left-1.5 w-5 h-0.5 bg-white opacity-70 blur-sm rounded-full" />
                <div className="absolute bottom-1.5 right-1 w-3 h-0.5 bg-blue-200 opacity-50 blur-sm rounded-full" />
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}