import { useState } from "react";
import { motion } from "framer-motion";
import { User } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { useProfile } from "@/hooks/useProfile";

export function NamePrompt() {
  const [name, setName] = useState("");
  const { updateProfile, updating } = useProfile();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    await updateProfile({
      display_name: name.trim()
    });
  };

  const handleSkip = async () => {
    await updateProfile({
      display_name: "User"
    });
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <GlassCard variant="bubble" glow className="p-8">
          <div className="text-center mb-6">
            <div className="mx-auto w-16 h-16 glass rounded-full flex items-center justify-center mb-4">
              <User className="h-8 w-8 text-primary-glow" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Welcome to ArcAI
            </h2>
            <p className="text-muted-foreground">
              What would you like me to call you?
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="glass border-glass-border text-center text-lg"
              autoFocus
            />
            
            <div className="flex gap-3">
              <GlassButton
                type="button"
                variant="ghost"
                onClick={handleSkip}
                disabled={updating}
                className="flex-1"
              >
                Skip
              </GlassButton>
              <GlassButton
                type="submit"
                disabled={!name.trim() || updating}
                className="flex-1"
              >
                {updating ? "Saving..." : "Continue"}
              </GlassButton>
            </div>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
}