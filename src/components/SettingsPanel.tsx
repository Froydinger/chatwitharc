import { useState } from "react";
import { motion } from "framer-motion";
import { Key, Volume2, Palette, Info, Trash2 } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ApiKeyModal } from "@/components/ApiKeyModal";

export function SettingsPanel() {
  const { 
    apiKey, 
    setApiKey, 
    selectedVoice, 
    setSelectedVoice, 
    theme, 
    setTheme,
    clearAllSessions
  } = useArcStore();
  const [showApiModal, setShowApiModal] = useState(false);

  const handleClearMessages = () => {
    clearAllSessions();
    // Simulate haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate([50, 50, 50]);
    }
  };

  const settings = [
    {
      title: "API Configuration",
      icon: Key,
      items: [
        {
          label: "OpenAI API Key",
          description: apiKey ? "API key configured" : "No API key set",
          action: (
            <GlassButton
              variant={apiKey ? "ghost" : "glow"}
              size="sm"
              onClick={() => setShowApiModal(true)}
            >
              {apiKey ? "Change" : "Add Key"}
            </GlassButton>
          )
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
      title: "Appearance",
      icon: Palette,
      items: [
        {
          label: "Glass Theme",
          description: "Switch between dark and light glass",
          action: (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Dark</span>
              <Switch
                checked={theme === 'light'}
                onCheckedChange={(checked) => setTheme(checked ? 'light' : 'dark')}
              />
              <span className="text-sm text-muted-foreground">Light</span>
            </div>
          )
        }
      ]
    },
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
    }
  ];

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-8">
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
                    className="flex items-center justify-between p-4 glass rounded-lg"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-foreground">{item.label}</p>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </div>
                    <div className="ml-4">
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
            <p>🔒 Secure local API key storage</p>
          </div>
        </GlassCard>
      </motion.div>

      <ApiKeyModal 
        isOpen={showApiModal} 
        onClose={() => setShowApiModal(false)} 
      />
    </div>
  );
}