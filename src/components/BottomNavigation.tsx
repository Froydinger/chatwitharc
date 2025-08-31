import { motion, PanInfo, useAnimation } from "framer-motion";
import { MessageCircle, Settings, History, Image } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { useRef, useState, useEffect } from "react";
import { ChatInput } from "@/components/ChatInput";

const navigationItems = [
  { id: "chat", icon: MessageCircle, label: "Chat" },
  { id: "history", icon: History, label: "History" },
  { id: "settings", icon: Settings, label: "Settings" },
] as const;

export function BottomNavigation() {
  const { currentTab, setCurrentTab } = useArcStore();
  const [isDragging, setIsDragging] = useState(false);
  const bubbleControls = useAnimation();

  const railRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Array<HTMLDivElement | null>>([]);

  const BUBBLE = 64; // w-16 h-16

  const getBubblePosition = () => {
    const idx = navigationItems.findIndex((i) => i.id === currentTab);
    const tabEl = tabRefs.current[idx];
    const rail = railRef.current;

    if (!tabEl || !rail) {
      const CELL = 106.67;
      return { x: idx * CELL + (CELL - BUBBLE) / 2, y: 0 };
    }

    const tabCenterX = tabEl.offsetLeft + tabEl.offsetWidth / 2;
    const xWithinRail = tabCenterX - BUBBLE / 2;
    return { x: xWithinRail, y: 0 };
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
    setCurrentTab(navigationItems[best].id);
  };

  const isChat = currentTab === "chat";

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative"
      >
        <motion.div
          className="relative flex flex-col items-center"
          animate={{
            paddingTop: "0.125rem",
            paddingBottom: "0.25rem",
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
          }}
        >
          <style>{`
            .chat-input-scope input:focus,
            .chat-input-scope input:focus-visible,
            .chat-input-scope textarea:focus,
            .chat-input-scope textarea:focus-visible {
              outline-color: hsl(200, 100%, 60%) !important;
              box-shadow: 0 0 0 3px color-mix(in oklab, hsl(200, 100%, 60%) 35%, transparent) !important;
              border-color: hsl(200, 100%, 60%) !important;
            }
          `}</style>

          <motion.div
            initial={false}
            animate={{
              maxHeight: isChat ? 140 : 0,
              opacity: isChat ? 1 : 0,
              y: isChat ? 2 : 8,
              marginBottom: isChat ? 8 : 0,
            }}
            transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full px-6 chat-input-scope"
            style={{ overflow: "hidden" }}
          >
            <div className="relative flex items-center gap-2">
              {/* Attach icon (now Image, lowered a bit) */}
              <button
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                style={{ transform: "translateY(4px)" }} // lower it
              >
                <Image className="w-5 h-5" strokeWidth={2} />
              </button>

              {/* Input itself */}
              <div className="flex-1">
                <ChatInput />
              </div>

              {/* Send icon */}
              <button className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 12l14-7-7 14-2-5-5-2z" />
                </svg>
              </button>
            </div>
          </motion.div>

          {/* Rail with bubble + icons */}
          <div className="relative z-20" style={{ width: 320, height: 64 }}>
            <div
              ref={railRef}
              className="absolute inset-0 flex justify-between items-center px-6"
              style={{ width: 320, height: 64 }}
            >
              {navigationItems.map((item, index) => {
                const Icon = item.icon;
                const active = currentTab === item.id;
                return (
                  <div
                    key={item.id}
                    ref={(el) => (tabRefs.current[index] = el)}
                    className="flex items-center justify-center cursor-pointer select-none"
                    style={{ width: 64, height: 64 }}
                    onClick={() => setCurrentTab(item.id)}
                  >
                    <Icon
                      className={`h-6 w-6 transition-colors duration-300 ${
                        active
                          ? "text-primary-foreground drop-shadow-lg"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Bubble */}
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
                scale: 1.25,
                zIndex: 1000,
                filter:
                  "drop-shadow(0 0 30px hsla(200, 100%, 60%, 0.8)) drop-shadow(0 0 60px hsla(200, 100%, 40%, 0.5))",
                transition: { type: "spring", damping: 6, stiffness: 280 },
              }}
              className="absolute left-0 top-0 -translate-y-3 w-16 h-16 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto"
              style={{
                background:
                  "radial-gradient(circle at center, hsla(200, 100%, 80%, 0.25) 0%, hsla(200, 100%, 80%, 0.3) 40%, hsla(200, 100%, 50%, 0.6) 100%)",
                backdropFilter: "blur(20px)",
                border: "2px solid hsla(200, 100%, 70%, 0.7)",
              }}
            />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}