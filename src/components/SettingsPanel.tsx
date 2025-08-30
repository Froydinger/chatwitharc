import { useState } from "react";
import { motion } from "framer-motion";
import { Key, Volume2, Palette, Info, Trash2, User, LogOut } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export function SettingsPanel() {
  const { 
    selectedVoice,
    setSelectedVoice, 
    clearAllSessions
  } = useArcStore();
  const { profile } = useAuth();
  const { updateProfile, updating } = useProfile();
  const { toast } = useToast();
  

  const handleClearMessages = () => {
    clearAllSessions();
    // Simulate haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      toast({
        title: "Signed out",
        description: "You've been signed out successfully"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to sign out",
        variant: "destructive"
      });
    }
  };

  const settings = [
    {
      title: "Personal Information",
      icon: User,
      items: [
        {
          label: "Your Name",
          description: "How Arc should address you",
          action: (
            <Input
              value={profile?.display_name || ""}
              onChange={(e) => updateProfile({ display_name: e.target.value })}
              placeholder="Enter your name"
              className="w-40 glass border-glass-border text-sm"
              disabled={updating}
            />
          )
        },
        {
          label: "Context & Preferences", 
          description: "Tell Arc about yourself and your needs",
          action: (
            <Textarea
              value={profile?.context_info || ""}
              onChange={(e) => updateProfile({ context_info: e.target.value })}
              placeholder="I'm interested in... I prefer... I'm working on..."
              className="w-full glass border-glass-border text-sm min-h-[80px] resize-none"
              disabled={updating}
            />
          ),
          fullWidth: true
        }
      ]
    },
    // Voice settings hidden but preserved
    // {
    //   title: "Voice Settings",
    //   icon: Volume2,
    //   items: [
    //     {
    //       label: "Voice Selection",
    //       description: "Choose your AI voice",
    //       action: (
    //         <Select value={selectedVoice} onValueChange={setSelectedVoice}>
    //           <SelectTrigger className="w-32 glass border-glass-border">
    //             <SelectValue />
    //           </SelectTrigger>
    //           <SelectContent className="glass border-glass-border">
    //             <SelectItem value="cedar">Cedar</SelectItem>
    //             <SelectItem value="marin">Marin</SelectItem>
    //           </SelectContent>
    //         </Select>
    //       )
    //     }
    //   ]
    // },
    {
      title: "Data Management",
      icon: Trash2,
      items: [
        {
          label: "Clear Messages",
          description: "Remove all chat history",
          action: (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleClearMessages}
              className="text-destructive hover:text-destructive"
            >
              Clear All
            </GlassButton>
          )
        }
      ]
    },
    {
      title: "Account",
      icon: LogOut,
      items: [
        {
          label: "Sign Out",
          description: "Sign out of your account",
          action: (
            <GlassButton
              variant="ghost"
              size="sm"
              onClick={handleSignOut}
              className="text-destructive hover:text-destructive"
            >
              Sign Out
            </GlassButton>
          )
        }
      ]
    }
  ];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-8 pt-16">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h2 className="text-2xl font-bold text-foreground mb-2">Settings</h2>
        <p className="text-muted-foreground">Customize your ArcAI experience</p>
      </motion.div>

      {settings.map((section, sectionIndex) => {
        const Icon = section.icon;
        
        return (
          <motion.div
            key={section.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: sectionIndex * 0.1 }}
          >
            <GlassCard variant="bubble" glow className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="glass rounded-lg p-2">
                  <Icon className="h-5 w-5 text-primary-glow" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {section.title}
                </h3>
              </div>

              <div className="space-y-4">
                {section.items.map((item, itemIndex) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: (sectionIndex * 0.1) + (itemIndex * 0.05) }}
                    className={`glass rounded-lg p-4 ${
                      item.fullWidth ? 'space-y-3' : 'flex items-center justify-between'
                    }`}
                  >
                    <div className={item.fullWidth ? 'space-y-2' : 'flex-1'}>
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <div className={item.fullWidth ? 'w-full' : 'ml-4'}>
                      {item.action}
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        );
      })}

      {/* App Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <GlassCard variant="bubble" className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="glass rounded-lg p-2">
              <Info className="h-5 w-5 text-primary-glow" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">About ArcAI</h3>
          </div>
          
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>✨ Beautiful glassmorphism interface</p>
            <p>🤖 Powered by OpenAI GPT-5 Nano & Realtime API</p>
            <p>🎙️ Cedar & Marin voice support</p>
            <p>📱 Mobile-first responsive design</p>
            <p>🔒 Secure server-side API handling</p>
          </div>
        </GlassCard>
      </motion.div>

    </div>
  );
}