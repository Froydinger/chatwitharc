import { motion, PanInfo, useAnimation } from "framer-motion";
import { MessageCircle, Settings, History } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { useRef, useState, useEffect } from "react";

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
  
  // Get actual position of active tab to center bubble
  const getBubblePosition = () => {
    const activeIndex = navigationItems.findIndex(item => item.id === currentTab);
    const tabElement = tabRefs.current[activeIndex];
    const containerElement = containerRef.current;
    
    if (tabElement && containerElement) {
      const tabRect = tabElement.getBoundingClientRect();
      const containerRect = containerElement.getBoundingClientRect();
      
      return {
        x: tabRect.left - containerRect.left + (tabRect.width / 2) - 32, // 32 = half bubble width
        y: tabRect.top - containerRect.top + (tabRect.height / 2) - 32    // 32 = half bubble height
      };
    }
    
    // Fallback positioning
    return {
      x: activeIndex * 96 + 16,
      y: 16
    };
  };

  // Move bubble to active tab when tab changes
  useEffect(() => {
    if (!isDragging) {
      const position = getBubblePosition();
      bubbleControls.start({
        x: position.x,
        y: position.y,
        transition: {
          type: "spring",
          damping: 15,
          stiffness: 300,
          duration: 0.6
        }
      });
    }
  }, [currentTab, isDragging, bubbleControls]);

  const handleDragEnd = (event: any, info: PanInfo) => {
    setIsDragging(false);
    
    // Find the closest tab based on drag position
    let closestTabIndex = 0;
    let minDistance = Infinity;
    
    tabRefs.current.forEach((tabRef, index) => {
      if (tabRef) {
        const tabRect = tabRef.getBoundingClientRect();
        const tabCenterX = tabRect.left + tabRect.width / 2;
        const tabCenterY = tabRect.top + tabRect.height / 2;
        
        const distance = Math.sqrt(
          Math.pow(info.point.x - tabCenterX, 2) + 
          Math.pow(info.point.y - tabCenterY, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestTabIndex = index;
        }
      }
    });
    
    setCurrentTab(navigationItems[closestTabIndex].id);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-8">
      <motion.div
        ref={containerRef}
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2, type: "spring", damping: 15 }}
        className="relative"
      >
        {/* Fixed Tab Bar Background */}
        <div className="bubble-nav relative px-8 py-4">
          {/* Draggable Selection Bubble */}
          <motion.div
            drag
            dragMomentum={false}
            dragElastic={0.2}
            dragConstraints={containerRef}
            onDragStart={() => setIsDragging(true)}
            onDragEnd={handleDragEnd}
            animate={bubbleControls}
            initial={getBubblePosition()}
            whileHover={{ scale: 1.05 }}
            whileDrag={{ 
              scale: 1.1,
              zIndex: 1000,
              filter: "drop-shadow(0 0 30px hsla(200, 100%, 60%, 0.8))"
            }}
            className="absolute w-16 h-16 rounded-full cursor-grab active:cursor-grabbing z-10"
            style={{
              background: "radial-gradient(circle at 30% 30%, hsla(200, 100%, 80%, 0.7) 0%, hsla(200, 100%, 50%, 0.5) 100%)",
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
              <div className="absolute top-2 left-3 w-8 h-1 bg-white opacity-70 blur-sm rounded-full" />
              <div className="absolute bottom-3 right-2 w-6 h-0.5 bg-blue-200 opacity-50 blur-sm rounded-full" />
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
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ 
                    duration: 0.6, 
                    delay: 0.4 + index * 0.15, 
                    type: "spring", 
                    damping: 12 
                  }}
                >
                  <motion.div
                    className="w-24 h-20 flex flex-col items-center justify-center cursor-pointer"
                    whileHover={{ 
                      scale: 1.05,
                      transition: { type: "spring", damping: 15, stiffness: 300 }
                    }}
                    whileTap={{ 
                      scale: 0.95,
                      transition: { duration: 0.1 }
                    }}
                    onClick={() => setCurrentTab(item.id)}
                  >
                    <Icon 
                      className={`h-6 w-6 mb-1 transition-colors duration-300 ${
                        isActive ? "text-white drop-shadow-lg" : "text-muted-foreground"
                      }`} 
                    />
                    
                    <span 
                      className={`text-xs font-medium transition-colors duration-300 ${
                        isActive ? "text-white drop-shadow-sm" : "text-muted-foreground"
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