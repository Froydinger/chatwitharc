import { motion, PanInfo, useAnimation } from "framer-motion";
import { MessageCircle, Settings, History } from "lucide-react";
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
  const bubbleWrapperRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);

  const getBubblePosition = () => {
    const idx = navigationItems.findIndex(i => i.id === currentTab);
    const tabEl = tabRefs.current[idx];
    const wrap = bubbleWrapperRef.current;
    if (!tabEl || !wrap) {
      // fallback centers on 96px cells
      const cell = 96, bubble = 80;
      return { x: idx * cell + (cell - bubble) / 2, y: -8 };
    }
    const wr = wrap.getBoundingClientRect();
    const tr = tabEl.getBoundingClientRect();
    const centerX = tr.left + tr.width / 2 - wr.left;
    return { x: centerX - 40, y: -8 }; // 40 = bubble half width
  };

  useEffect(() => {
    if (isDragging) return;
    const p = getBubblePosition();
    bubbleControls.start({
      x: p.x, y: p.y,
      transition: { type: "spring", damping: 12, stiffness: 300, mass: 0.6, duration: 0.35 }
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
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); };
  }, []);

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    let best = 0, dist = Infinity;
    tabRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const c = r.left + r.width / 2;
      const d = Math.abs(info.point.x - c);
      if (d < dist) { dist = d; best = i; }
    });
    setCurrentTab(navigationItems[best].id);
  };

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
            paddingTop: currentTab === "chat" ? "1.5rem" : "0.75rem",
            paddingBottom: "0.75rem",
          }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{
            background:
              "linear-gradient(135deg, hsla(240, 15%, 12%, 0.3) 0%, hsla(240, 20%, 15%, 0.4) 100%)",
            backdropFilter: "blur(20px)",
            borderRadius: "2rem",
            border: "1px solid hsla(240, 25%, 25%, 0.3)",
            boxShadow: `
              0 0 40px hsla(200, 100%, 70%, 0.2),
              0 8px 32px hsla(200, 100%, 60%, 0.15),
              inset 0 1px 0 hsla(200, 100%, 80%, 0.3),
              inset 0 -1px 0 hsla(200, 100%, 30%, 0.2)
            `,
            minWidth: "288px",
            width: "auto",
          }}
        >
          {currentTab === "chat" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="w-full px-6 mb-6"
            >
              <ChatInput />
            </motion.div>
          )}

          {/* Bubble positioning rail. No padding. No gap. */}
          <div
            ref={bubbleWrapperRef}
            className="absolute inset-0 pointer-events-none z-30"
            style={{
              top: currentTab === "chat" ? "6rem" : "0.75rem",
              left: 0,
              right: 0,
              bottom: "0.75rem",
              display: "flex",
              justifyContent: "center",
              alignItems: "end",
            }}
          >
            <div className="relative" style={{ width: 288, height: 64 }}>
              <motion.div
                drag="x"
                dragMomentum
                dragElastic={0.4}
                dragConstraints={bubbleWrapperRef}
                onDragStart={() => setIsDragging(true)}
                onDragEnd={handleDragEnd}
                animate={bubbleControls}
                initial={getBubblePosition()}
                whileHover={{ scale: 1.05, transition: { type: "spring", damping: 10, stiffness: 400 } }}
                whileDrag={{
                  scale: 1.3,
                  zIndex: 1000,
                  filter:
                    "drop-shadow(0 0 40px hsla(200, 100%, 60%, 0.9)) drop-shadow(0 0 80px hsla(200, 100%, 40%, 0.6))",
                  transition: { type: "spring", damping: 5, stiffness: 300 },
                }}
                className="absolute w-20 h-20 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto"
                style={{
                  background:
                    "radial-gradient(circle at center, hsla(200, 100%, 80%, 0.2) 0%, hsla(200, 100%, 80%, 0.3) 40%, hsla(200, 100%, 50%, 0.6) 100%)",
                  backdropFilter: "blur(20px)",
                  border: "2px solid hsla(200, 100%, 70%, 0.7)",
                  boxShadow: `
                    0 0 40px hsla(200, 100%, 60%, 0.5),
                    0 8px 32px hsla(200, 100%, 50%, 0.3),
                    inset 0 2px 0 hsla(200, 100%, 90%, 0.6),
                    inset 0 -2px 0 hsla(200, 100%, 30%, 0.4)
                  `,
                }}
              >
                <div className="absolute inset-1 rounded-full overflow-hidden">
                  <div className="absolute top-1 left-2 w-6 h-0.5 bg-white opacity-70 blur-sm rounded-full" />
                  <div className="absolute bottom-2 right-1 w-4 h-0.5 bg-blue-200 opacity-50 blur-sm rounded-full" />
                </div>
              </motion.div>
            </div>
          </div>

          {/* Tab row. Zero padding. Exact cells. */}
          <div
            className="relative z-20 grid grid-cols-3 place-items-center p-0 m-0 gap-0"
            style={{ width: 288 }}
          >
            {navigationItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <div
                  key={item.id}
                  ref={(el) => (tabRefs.current[index] = el)}
                  className="w-24 h-16 inline-flex flex-col items-center justify-center cursor-pointer select-none"
                  onClick={() => setCurrentTab(item.id)}
                >
                  <Icon
                    className={`h-6 w-6 mb-1 transition-colors duration-300 ${
                      isActive
                        ? "text-primary-foreground drop-shadow-lg"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium transition-colors duration-300 ${
                      isActive
                        ? "text-primary-foreground drop-shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}