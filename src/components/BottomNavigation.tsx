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
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  // Get bubble position for active tab (large circular bubble)
  const getBubblePosition = () => {
    const activeIndex = navigationItems.findIndex(item => item.id === currentTab);
    // Each tab is w-24 (96px), bubble is w-20 h-20 (80px) - large circular bubble
    const tabWidth = 96;
    const bubbleWidth = 80;
    
    // Calculate vertical position - bubble should always be centered on the tab items
    const tabBarHeight = 64; // h-16 = 64px (height of tab items container)
    const bubbleHeight = 80; // h-20 = 80px
    const verticalOffset = -(bubbleHeight - tabBarHeight) / 2; // Center bubble on tab items
    
    return {
      x: activeIndex * tabWidth + (tabWidth - bubbleWidth) / 2, // Center horizontally
      y: verticalOffset // Always centered on tab items, regardless of chat input
    };
  };

  // Move bubble to active tab when tab changes
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

  // Set initial position immediately and ensure perfect positioning
  useEffect(() => {
    const setPosition = () => {
      const position = getBubblePosition();
      bubbleControls.set({
        x: position.x,
        y: position.y
      });
    };
    
    // Set initial position immediately
    setPosition();
    
    // Re-calculate after layout is stable
    const timer = setTimeout(setPosition, 50);
    
    // Also re-calculate when window resizes to maintain perfect positioning
    const handleResize = () => setPosition();
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
    };
  }, []); // Only run on mount

  const handleDragEnd = (event: any, info: PanInfo) => {
    setIsDragging(false);
    
    // Find the closest tab based on horizontal position only (lock vertical position)
    let closestTabIndex = 0;
    let minDistance = Infinity;
    
    tabRefs.current.forEach((tabRef, index) => {
      if (tabRef) {
        const tabRect = tabRef.getBoundingClientRect();
        const tabCenterX = tabRect.left + tabRect.width / 2;
        
        // Only consider horizontal distance, ignore vertical
        const distance = Math.abs(info.point.x - tabCenterX);
        
        if (distance < minDistance) {
          minDistance = distance;
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
        animate={{ 
          y: 0, 
          opacity: 1,
        }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative"
      >
        {/* Tab Bar Background - Fixed position container */}
        <div className="bubble-nav relative px-6 py-3">
          {/* Chat Input - Only visible on chat tab, positioned above tabs */}
          {currentTab === 'chat' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="absolute bottom-full left-6 right-6 pb-6"
            >
              <div className="bubble-nav p-4">
                <ChatInput />
              </div>
            </motion.div>
          )}
          {/* Draggable Selection Bubble */}
          <motion.div
            drag="x" // Only allow horizontal dragging
            dragMomentum={true} // Enable momentum for jelly physics
            dragElastic={0.4} // More elastic for rubber band effect
            dragConstraints={containerRef}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            animate={bubbleControls}
            initial={getBubblePosition()}
            whileHover={{ 
              scale: 1.05,
              transition: { type: "spring", damping: 10, stiffness: 400 }
            }}
            whileDrag={{ 
              scale: 1.3, // Much bigger when dragging - magnifying glass effect
              zIndex: 1000,
              filter: "drop-shadow(0 0 40px hsla(200, 100%, 60%, 0.9)) drop-shadow(0 0 80px hsla(200, 100%, 40%, 0.6))",
              transition: { type: "spring", damping: 5, stiffness: 300 }
            }}
            className="absolute w-20 h-20 rounded-full cursor-grab active:cursor-grabbing z-30"
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
            {/* Inner light effects */}
            <div className="absolute inset-1 rounded-full overflow-hidden">
              <div className="absolute top-1 left-2 w-6 h-0.5 bg-white opacity-70 blur-sm rounded-full" />
              <div className="absolute bottom-2 right-1 w-4 h-0.5 bg-blue-200 opacity-50 blur-sm rounded-full" />
            </div>
          </motion.div>

          {/* Tab Items */}
          <div className="flex items-center relative z-20">
            {navigationItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              
              return (
                <motion.div
                  key={item.id}
                  ref={(el) => tabRefs.current[index] = el}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ 
                    duration: 0.2, 
                    delay: 0.1 + index * 0.05, 
                    ease: [0.25, 0.1, 0.25, 1]
                  }}
                >
                  <motion.div
                    className="w-24 h-16 flex flex-col items-center justify-center cursor-pointer"
                    whileHover={{ 
                      scale: 1.05,
                      transition: { type: "spring", damping: 20, stiffness: 400 }
                    }}
                    whileTap={{ 
                      scale: 0.95,
                      transition: { duration: 0.1 }
                    }}
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
        </div>
      </motion.div>
    </div>
  );
}