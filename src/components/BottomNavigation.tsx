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
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const bubbleControls = useAnimation();
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  
  // Get the position of the active tab
  const getActiveTabPosition = () => {
    const activeIndex = navigationItems.findIndex(item => item.id === currentTab);
    const tabElement = tabRefs.current[activeIndex];
    if (tabElement) {
      const rect = tabElement.getBoundingClientRect();
      const containerRect = tabElement.closest('.tab-container')?.getBoundingClientRect();
      if (containerRect) {
        return {
          x: rect.left - containerRect.left + rect.width / 2 - 30, // 30 is half bubble width
          y: rect.top - containerRect.top + rect.height / 2 - 30   // 30 is half bubble height
        };
      }
    }
    return { x: 0, y: 0 };
  };

  // Animate bubble to active tab position
  useEffect(() => {
    if (!isDragging) {
      const position = getActiveTabPosition();
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
    
    // Find closest tab
    let closestTab = currentTab;
    let minDistance = Infinity;
    
    navigationItems.forEach((item, index) => {
      const tabElement = tabRefs.current[index];
      if (tabElement) {
        const rect = tabElement.getBoundingClientRect();
        const bubbleRect = { 
          x: info.point.x, 
          y: info.point.y 
        };
        
        const distance = Math.sqrt(
          Math.pow(bubbleRect.x - (rect.left + rect.width / 2), 2) +
          Math.pow(bubbleRect.y - (rect.top + rect.height / 2), 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestTab = item.id;
        }
      }
    });
    
    setCurrentTab(closestTab);
  };

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2, type: "spring", damping: 15 }}
      className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50"
    >
      <div className="tab-container relative bubble-nav">
        {/* Draggable Selection Bubble */}
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.3}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={handleDragEnd}
          animate={bubbleControls}
          whileHover={{ scale: 1.1 }}
          whileDrag={{ 
            scale: 1.2,
            zIndex: 1000,
            boxShadow: "0 0 50px hsla(200, 100%, 60%, 0.4), 0 0 100px hsla(200, 100%, 50%, 0.2)"
          }}
          className="absolute w-16 h-16 rounded-full cursor-grab active:cursor-grabbing z-20"
          style={{
            background: "linear-gradient(135deg, hsla(200, 100%, 70%, 0.3) 0%, hsla(200, 100%, 50%, 0.4) 100%)",
            backdropFilter: "blur(16px)",
            border: "2px solid hsla(200, 100%, 60%, 0.5)",
            boxShadow: `
              0 0 30px hsla(200, 100%, 60%, 0.3),
              0 8px 32px hsla(200, 100%, 50%, 0.2),
              inset 0 1px 0 hsla(200, 100%, 80%, 0.4),
              inset 0 -1px 0 hsla(200, 100%, 30%, 0.3)
            `
          }}
          initial={{ scale: 0 }}
          transition={{
            type: "spring",
            damping: 12,
            stiffness: 300
          }}
        >
          {/* Inner light refraction */}
          <div className="absolute inset-2 rounded-full">
            <div className="absolute top-1 left-2 w-6 h-0.5 bg-gradient-to-r from-transparent via-white to-transparent opacity-60 blur-sm" />
            <div className="absolute bottom-2 right-2 w-4 h-0.5 bg-gradient-to-r from-transparent via-blue-200 to-transparent opacity-40 blur-sm" />
          </div>
        </motion.div>

        {/* Fixed Tab Items */}
        <div className="flex items-center gap-8 px-6 py-4">
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
                className="relative z-10"
              >
                <motion.div
                  className="px-4 py-4 cursor-pointer relative"
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
                  <div className="flex flex-col items-center gap-2">
                    <motion.div
                      animate={isActive ? { 
                        scale: [1, 1.1, 1],
                        transition: { duration: 2, repeat: Infinity, repeatDelay: 4 }
                      } : {}}
                    >
                      <Icon 
                        className={`h-6 w-6 transition-colors duration-300 ${
                          isActive ? "text-white drop-shadow-lg" : "text-foreground"
                        }`} 
                      />
                    </motion.div>
                    
                    <span 
                      className={`text-xs font-medium transition-colors duration-300 ${
                        isActive ? "text-white drop-shadow-sm" : "text-muted-foreground"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}