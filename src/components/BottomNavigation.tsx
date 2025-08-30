import { motion, PanInfo, useAnimation } from "framer-motion";
import { MessageCircle, Settings, History } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { useRef, useState, useEffect } from "react";
import { ChatInput } from "@/components/ChatInput";

const navigationItems = [
  { id: 'chat', icon: MessageCircle, label: 'Chat' },
  { id: 'history', icon: History, label: 'History' },
  { id: 'settings', icon: Settings, label: 'Settings' }
] as const;

export function BottomNavigation() {
  const { currentTab, setCurrentTab } = useArcStore();
  const [isDragging, setIsDragging] = useState(false);
  const bubbleControls = useAnimation();
  const containerRef = useRef<HTMLDivElement>(null);
  const bubbleWrapperRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  const getBubblePosition = () => {
    const activeIndex = navigationItems.findIndex(item => item.id === currentTab);
    const activeTabRef = tabRefs.current[activeIndex];
    
    if (!activeTabRef || !bubbleWrapperRef.current) {
      const tabWidth = 96; // w-24
      const bubbleWidth = 80; // w-20
      const x = (activeIndex * tabWidth) + (tabWidth - bubbleWidth) / 2;
      return { x, y: -8 };
    }
    
    const wrapperRect = bubbleWrapperRef.current.getBoundingClientRect();
    const tabRect = activeTabRef.getBoundingClientRect();
    const tabCenterX = tabRect.left + tabRect.width / 2 - wrapperRect.left;
    const bubbleX = tabCenterX - 40; // half of 80
    
    return { x: bubbleX, y: -8 };
  };

  useEffect(() => {
    const position = getBubblePosition();
    if (!isDragging) {
      bubbleControls.start({
        x: position.x,
        y: position.y,
        transition: {
          type: "spring",
          damping: 12,
          stiffness: 300,
          mass: 0.6,
          duration: 0.4
        }
      });
    }
  }, [currentTab, isDragging, bubbleControls]);

  useEffect(() => {
    const setPosition = () => {
      const position = getBubblePosition();
      bubbleControls.set({ x: position.x, y: position.y });
    };
    setPosition();
    const timer = setTimeout(setPosition, 50);
    const handleResize = () => setPosition();
    window.addEventListener('resize', handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []); 

  const handleDragEnd = (_: any, info: PanInfo) => {
    setIsDragging(false);
    let closestTabIndex = 0;
    let minDistance = Infinity;
    tabRefs.current.forEach((tabRef, index) => {
      if (tabRef) {
        const r = tabRef.getBoundingClientRect();
        const center = r.left + r.width / 2;
        const d = Math.abs(info.point.x - center);
        if (d < minDistance) {
          minDistance = d;
          closestTabIndex = index;
        }
      }
    });
    setCurrentTab(navigationItems[closestTabIndex].id);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 flex justify-center">
      <motion.div
        ref={containerRef}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative"
      >
        <motion.div 
          className="relative flex flex-col items-center"
          animate={{
            paddingTop: currentTab === 'chat' ? '1.5rem' : '0.75rem',
            paddingBottom: '0.75rem'
          }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          style={{
            background: "linear-gradient(135deg, hsla(240, 15%, 12%, 0.3) 0%, hsla(240, 20%, 15%, 0.4) 100%)",
            backdropFilter: "blur(20px)",
            borderRadius: "2rem",
            border: "1px solid hsla(240, 25%, 25%, 0.3)",
            boxShadow: `
              0 0 40px hsla(200, 100%, 70%, 0.2),
              0 8px 32px hsla(200, 100%, 60%, 0.15),
              inset 0 1px 0 hsla(200, 100%, 80%, 0.3),
              inset 0 -1px 0 hsla(200, 100%, 30%, 0.2)
            `,
            minWidth: '288px',
            width: 'auto'
          }}
        >
          {currentTab === 'chat' && (
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
          
          {/* Bubble wrapper aligned to tab rail */}
          <div 
            ref={bubbleWrapperRef}
            className="absolute inset-0 pointer-events-none z-30"
            style={{ 
              top: currentTab === 'chat' ? '6rem' : '0.75rem',
              left: 0,
              right: 0,
              bottom: '0.75rem',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'end'
            }}
          >
            <div className="relative" style={{ width: '288px', height: '64px' }}>
              <motion.div
                drag="x"
                dragMomentum={true}
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
                  filter: "drop-shadow(0 0 40px hsla(200, 100%, 60%, 0.9)) drop-shadow(0 0 80px hsla(200, 100%, 40%, 0.6))",
                  transition: { type: "spring", damping: 5, stiffness: 300 }
                }}
                className="absolute w-20 h-20 rounded-full cursor-grab active:cursor-grabbing pointer-events-auto"
                style={{
                  background: "radial-gradient(circle at center, hsla(200, 100%, 80%, 0.2) 0%, hsla(200, 100%, 80%, 0.3) 40%, hsla(200, 100%, 50%, 0.6) 100%)",
                  backdropFilter: "blur(20px)",
                  border: "2px solid hsla(200, 100%, 70%, 0.7)",
                  boxShadow: `
                    0 0 40px hsla(200, 100%, 60%, 0.5),
                    0 8px 32px hsla(200, 100%, 50%, 0.3),
                    inset 0 2px 0 hsla(200, 100%, 90%, 0.6),
                    inset 0 -2px 0 hsla(200, 100%, 30%, 0.4)
                  `
                }}
              >
                <div className="absolute inset-1 rounded-full overflow-hidden">
                  <div className="absolute top-1 left-2 w-6 h-0.5 bg-white opacity-70 blur-sm rounded-full" />
                  <div className="absolute bottom-2 right-1 w-4 h-0.5 bg-blue-200 opacity-50 blur-sm rounded-full" />
                </div>
              </motion.div>
            </div>
          </div>

          {/* Tab Items — removed px-6 and forced even distribution */}
          <div
            className="flex items-center justify-between relative z-20"
            style={{ width: '288px' }}
          >
            {navigationItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              
              return (
                <motion.div
                  key={item.id}
                  ref={(el) => (tabRefs.current[index] = el)}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.2, delay: 0.1 + index * 0.05, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <motion.div
                    className="w-24 h-16 flex flex-col items-center justify-center cursor-pointer"
                    whileHover={{ scale: 1.05, transition: { type: "spring", damping: 20, stiffness: 400 } }}
                    whileTap={{ scale: 0.95, transition: { duration: 0.1 } }}
                    onClick={() => setCurrentTab(item.id)}
                  >
                    <Icon 
                      className={`h-6 w-6 mb-1 transition-colors duration-300 ${
                        isActive ? "text-primary-foreground drop-shadow-lg" : "text-muted-foreground hover:text-foreground"
                      }`} 
                    />
                    <span 
                      className={`text-xs font-medium transition-colors duration-300 ${
                        isActive ? "text-primary-foreground drop-shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </span>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}