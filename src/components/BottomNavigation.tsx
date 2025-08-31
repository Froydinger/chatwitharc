import { motion, PanInfo, useAnimation } from "framer-motion";
import { MessageCircle, Settings, History, Image as ImageIcon } from "lucide-react";
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

  const BUBBLE = 64;

  const getBubblePosition = () => {
    const idx = navigationItems.findIndex((i) => i.id === currentTab);
    const tabEl = tabRefs.current[idx];
    const rail = railRef.current;

    if (!tabEl || !rail) {
      const CELL = 106.67;
      return { x: idx * CELL + (CELL - BUBBLE) / 2, y: 0 };
    }

    const tabCenterX = tabEl.offsetLeft + tabEl.offsetWidth / 2;
    return { x: tabCenterX - BUBBLE / 2, y: 0 };
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
    const setNow = () => bubbleControls.set(getBubblePosition());
    setNow();
    const t = setTimeout(setNow, 60);
    window.addEventListener("resize", setNow);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", setNow);
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

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="relative"
      >
        <motion.div
          className="relative flex flex-col items-center"
          style={{
            background:
              "linear-gradient(135deg, hsla(240, 15%, 12%, 0.3) 0%, hsla(240, 20%, 15%, 0.4) 100%)",
            backdropFilter: "blur(20px)",
            borderRadius: "3rem",
            border: "1px solid hsla(240, 25%, 25%, 0.3)",
            minWidth: 320,
            width: 320,
          }}
        >
          {currentTab === "chat" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.25 }}
              className="w-full px-6 chat-input-scope"
            >
              <ChatInput
                attachButton={
                  <button
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                    style={{ transform: "translateY(5px)" }} // lower the icon
                  >
                    <ImageIcon className="w-5 h-5" strokeWidth={2} />
                  </button>
                }
              />
            </motion.div>
          )}

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
                      className={`h-6 w-6 transition-colors ${
                        active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                      }`}
                    />
                  </div>
                );
              })}
            </div>

            <motion.div
              drag="x"
              dragConstraints={railRef}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={handleDragEnd}
              animate={bubbleControls}
              initial={getBubblePosition()}
              className="absolute left-0 top-0 -translate-y-3 w-16 h-16 rounded-full cursor-grab"
              style={{
                background:
                  "radial-gradient(circle at center, hsla(200, 100%, 80%, 0.25) 0%, hsla(200, 100%, 50%, 0.6) 100%)",
                border: "2px solid hsla(200, 100%, 70%, 0.7)",
              }}
            />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}