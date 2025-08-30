import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Key, Eye, EyeOff, Shield } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";

interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ isOpen, onClose }: ApiKeyModalProps) {
  const { setApiKey } = useArcStore();
  const [inputKey, setInputKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);

  const handleSave = async () => {
    if (!inputKey.trim()) return;
    
    setIsValidating(true);
    
    // Simulate API key validation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setApiKey(inputKey.trim());
    setIsValidating(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <GlassCard variant="strong" glow className="w-full max-w-md p-8">
            <div className="text-center mb-6">
              <motion.div
                initial={{ rotate: -180, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ duration: 0.5, type: "spring" }}
                className="inline-flex items-center justify-center w-16 h-16 glass rounded-full mb-4"
              >
                <Key className="h-8 w-8 text-primary-glow" />
              </motion.div>
              
              <h2 className="text-2xl font-bold text-foreground mb-2">
                Welcome to ArcAI
              </h2>
              <p className="text-muted-foreground">
                Enter your OpenAI API key to get started with magical AI conversations
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  placeholder="sk-..."
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  className="glass border-glass-border bg-glass/50 pr-12"
                />
                
                <GlassButton
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </GlassButton>
              </div>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-4 w-4 text-success" />
                <span>Your API key is stored securely in your browser</span>
              </div>

              <div className="flex gap-3">
                <GlassButton
                  variant="ghost"
                  className="flex-1"
                  onClick={onClose}
                  disabled={isValidating}
                >
                  Cancel
                </GlassButton>
                
                <GlassButton
                  variant="glow"
                  className="flex-1"
                  onClick={handleSave}
                  disabled={!inputKey.trim() || isValidating}
                >
                  {isValidating ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                    />
                  ) : (
                    "Save Key"
                  )}
                </GlassButton>
              </div>
            </div>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}