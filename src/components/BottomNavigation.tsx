import { motion } from "framer-motion";
import { MessageCircle, Settings, Info } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";

const navigationItems = [
  { id: 'chat', icon: MessageCircle, label: 'Chat' },
  // { id: 'voice', icon: Mic, label: 'Voice' }, // Hidden for now - voice logic preserved
  { id: 'settings', icon: Settings, label: 'Settings' },
  { id: 'info', icon: Info, label: 'Info' }
] as const;

export function BottomNavigation() {
  const { currentTab, setCurrentTab } = useArcStore();

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.2, type: "spring", damping: 15 }}
      className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50"
    >
      <div className="bubble-nav animate-bounce-gentle">
        <div className="flex items-center gap-6">
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
                  className={`bubble-nav-item ${isActive ? 'active' : ''} px-6 py-4 cursor-pointer`}
                  whileHover={{ 
                    scale: 1.05,
                    rotate: [0, -2, 2, 0]
                  }}
                  whileTap={{ 
                    scale: 0.95 
                  }}
                  onClick={() => setCurrentTab(item.id)}
                  transition={{ 
                    type: "spring", 
                    damping: 15,
                    stiffness: 300
                  }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <motion.div
                      animate={isActive ? { 
                        rotate: [0, -10, 10, 0],
                        scale: [1, 1.2, 1]
                      } : {}}
                      transition={{ 
                        duration: 0.8,
                        repeat: isActive ? Infinity : 0,
                        repeatDelay: 3
                      }}
                    >
                      <Icon 
                        className={`h-6 w-6 transition-colors duration-300 ${
                          isActive ? "text-primary-glow" : "text-foreground"
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
  );
}