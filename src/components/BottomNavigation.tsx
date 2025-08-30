import { motion } from "framer-motion";
import { MessageCircle, Mic, Settings, Info } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassButton } from "@/components/ui/glass-button";

const navigationItems = [
  { id: 'chat', icon: MessageCircle, label: 'Chat' },
  { id: 'voice', icon: Mic, label: 'Voice' },
  { id: 'settings', icon: Settings, label: 'Settings' },
  { id: 'info', icon: Info, label: 'Info' }
] as const;

export function BottomNavigation() {
  const { currentTab, setCurrentTab } = useArcStore();

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.2, type: "spring", damping: 20 }}
      className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50"
    >
      <div className="bubble-nav px-6 py-3">
        <div className="flex items-center gap-4">
          {navigationItems.map((item, index) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            
            return (
              <motion.div
                key={item.id}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ 
                  duration: 0.4, 
                  delay: 0.3 + index * 0.1, 
                  type: "spring", 
                  damping: 15 
                }}
              >
                <GlassButton
                  variant={isActive ? "glow" : "bubble"}
                  size="bubble"
                  onClick={() => setCurrentTab(item.id)}
                  className={`relative transition-all duration-300 ${
                    isActive ? "scale-110" : "hover:scale-105"
                  }`}
                  aria-label={item.label}
                >
                  <motion.div
                    animate={isActive ? { 
                      rotate: [0, -5, 5, 0],
                      scale: [1, 1.1, 1]
                    } : {}}
                    transition={{ 
                      duration: 0.5,
                      repeat: isActive ? Infinity : 0,
                      repeatDelay: 2
                    }}
                  >
                    <Icon 
                      className={`h-5 w-5 transition-colors duration-200 ${
                        isActive ? "text-primary-glow" : "text-foreground"
                      }`} 
                    />
                  </motion.div>
                  
                  {/* Active indicator */}
                  {isActive && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-2 h-2 bg-primary-glow rounded-full"
                    />
                  )}
                </GlassButton>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}