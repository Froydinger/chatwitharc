import { useState } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { User, MessageCircle } from "lucide-react";

interface OnboardingScreenProps {
  onComplete: () => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [displayName, setDisplayName] = useState("");
  const [contextInfo, setContextInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleComplete = async () => {
    if (!displayName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter your name to continue",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      if (!supabase || !isSupabaseConfigured) {
        throw new Error("Profile setup is not available. Please try again later.");
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("No authenticated user found");
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim(),
          context_info: contextInfo.trim() || null
        })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: "Welcome!",
        description: "Your profile has been set up successfully"
      });

      onComplete();
    } catch (error: any) {
      console.error('Profile update error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleComplete();
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden flex items-center justify-center p-4">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <motion.div
          animate={{
            background: [
              "radial-gradient(circle at 20% 50%, hsl(var(--primary-glow) / 0.1) 0%, transparent 50%)",
              "radial-gradient(circle at 80% 20%, hsl(var(--primary-glow) / 0.1) 0%, transparent 50%)",
              "radial-gradient(circle at 40% 80%, hsl(var(--primary-glow) / 0.1) 0%, transparent 50%)"
            ]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="w-full h-full"
        />
      </div>

      <GlassCard variant="bubble" glow className="w-full max-w-md p-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Logo */}
          <div className="text-center">
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="flex justify-center mb-4"
            >
              <img src="/arc-logo-ui.png" alt="ArcAI" className="h-16 w-16" />
            </motion.div>
            <h1 className="text-2xl font-bold text-foreground mb-2">
              Welcome to ArcAI!
            </h1>
            <p className="text-muted-foreground">
              Let's personalize your AI experience
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">Your Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="displayName"
                  type="text"
                  placeholder="How should I call you?"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="pl-10"
                  disabled={loading}
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="contextInfo">
                Context about you 
                <span className="text-sm text-muted-foreground ml-1">(optional)</span>
              </Label>
              <div className="relative">
                <MessageCircle className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Textarea
                  id="contextInfo"
                  placeholder="Tell me about yourself, your interests, or how you'd like me to assist you..."
                  value={contextInfo}
                  onChange={(e) => setContextInfo(e.target.value)}
                  className="pl-10 min-h-[100px] resize-none"
                  disabled={loading}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                This helps me provide more personalized responses
              </p>
            </div>

            <GlassButton
              variant="glow"
              onClick={handleComplete}
              disabled={loading || !displayName.trim()}
              className="w-full"
            >
              {loading ? "Setting up..." : "Get Started"}
            </GlassButton>
          </div>
        </motion.div>
      </GlassCard>
    </div>
  );
}