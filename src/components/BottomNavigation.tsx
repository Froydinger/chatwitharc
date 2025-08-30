import { motion, PanInfo } from "framer-motion";
import { MessageCircle, Settings, History } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { useDndContext, DndContext, DragEndEvent, useDraggable } from "@dnd-kit/core";
import { useRef, useState } from "react";

const navigationItems = [
  { id: 'chat', icon: MessageCircle, label: 'Chat' },
  { id: 'history', icon: History, label: 'History' },
  { id: 'settings', icon: Settings, label: 'Settings' }
] as const;

function DraggableNavigation() {
  const { currentTab, setCurrentTab } = useArcStore();
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const constraintsRef = useRef(null);

  return (
    <motion.div
      ref={constraintsRef}
      className="fixed inset-0 pointer-events-none z-50"
    >
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.2}
        dragMomentum={false}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onDrag={(_, info: PanInfo) => {
          setPosition({ x: info.offset.x, y: info.offset.y });
        }}
        initial={{ 
          x: "calc(50vw - 50%)", 
          y: "calc(100vh - 120px)",
          opacity: 0,
          scale: 0.8
        }}
        animate={{ 
          opacity: 1,
          scale: 1
        }}
        transition={{ 
          duration: 0.8, 
          delay: 0.2, 
          type: "spring", 
          damping: 15,
          stiffness: 100
        }}
        className="pointer-events-auto absolute"
        style={{
          filter: "drop-shadow(0 0 20px hsla(200, 100%, 60%, 0.3))"
        }}
      >
        <div className="bubble-nav relative overflow-hidden">
          {/* Light refraction effect */}
          <div className="absolute inset-0 rounded-full">
            <div className="absolute top-2 left-4 w-16 h-1 bg-gradient-to-r from-transparent via-white to-transparent opacity-30 blur-sm" />
            <div className="absolute bottom-2 right-4 w-12 h-1 bg-gradient-to-r from-transparent via-blue-200 to-transparent opacity-20 blur-sm" />
          </div>
          
          <div className="flex items-center gap-6 relative z-10">
            {navigationItems.map((item, index) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              
              return (
                <motion.div
                  key={item.id}
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ 
                    duration: 0.6, 
                    delay: 0.4 + index * 0.15, 
                    type: "spring", 
                    damping: 12 
                  }}
                  className="relative"
                >
                  <motion.div
                    className={`bubble-nav-item ${isActive ? 'active' : ''} px-6 py-4 cursor-pointer relative overflow-hidden`}
                    whileHover={{ 
                      scale: 1.05,
                      rotateY: 5,
                      transition: { type: "spring", damping: 15, stiffness: 300 }
                    }}
                    whileTap={{ 
                      scale: 0.95,
                      transition: { duration: 0.1 }
                    }}
                    onClick={() => setCurrentTab(item.id)}
                  >
                    {/* Inner glow for active state */}
                    {isActive && (
                      <motion.div
                        className="absolute inset-0 rounded-3xl"
                        style={{
                          background: "linear-gradient(135deg, hsla(200, 100%, 70%, 0.1) 0%, hsla(200, 100%, 50%, 0.2) 100%)",
                          boxShadow: "inset 0 0 20px hsla(200, 100%, 60%, 0.3)"
                        }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3 }}
                      />
                    )}
                    
                    <div className="flex flex-col items-center gap-2 relative z-10">
                      <motion.div
                        animate={isActive ? { 
                          scale: [1, 1.1, 1],
                          transition: { duration: 2, repeat: Infinity, repeatDelay: 4 }
                        } : {}}
                      >
                        <Icon 
                          className={`h-6 w-6 transition-colors duration-300 ${
                            isActive ? "text-primary-glow drop-shadow-sm" : "text-foreground"
                          }`} 
                        />
                      </motion.div>
                      
                      <span 
                        className={`text-xs font-medium transition-colors duration-300 ${
                          isActive ? "text-primary-glow" : "text-muted-foreground"
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
    </motion.div>
  );
}

export function BottomNavigation() {
  return <DraggableNavigation />;
}