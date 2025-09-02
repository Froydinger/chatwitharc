import { useState } from "react";
import { Wrench, History, Settings as SettingsIcon } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { ChatHistoryPanel } from "@/components/ChatHistoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";

export function ToolsPanel() {
  const [activeSection, setActiveSection] = useState<'history' | 'settings'>('history');

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-20 pt-16 px-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex items-center justify-center gap-3">
          <div className="glass rounded-full p-3">
            <Wrench className="h-8 w-8 text-primary-glow" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">Tools</h2>
        </div>
        <p className="text-muted-foreground text-base">
          Manage your chat history and customize your settings
        </p>
      </div>

      {/* Section Toggle */}
      <div className="max-w-md mx-auto">
        <GlassCard variant="bubble" className="p-2">
          <div className="flex rounded-full bg-glass/20">
            <GlassButton
              variant={activeSection === 'history' ? 'glow' : 'ghost'}
              className="flex-1 rounded-full"
              onClick={() => setActiveSection('history')}
            >
              <History className="h-4 w-4 mr-2" />
              Chat History
            </GlassButton>
            <GlassButton
              variant={activeSection === 'settings' ? 'glow' : 'ghost'}
              className="flex-1 rounded-full"
              onClick={() => setActiveSection('settings')}
            >
              <SettingsIcon className="h-4 w-4 mr-2" />
              Settings
            </GlassButton>
          </div>
        </GlassCard>
      </div>

      {/* Content */}
      <div className="w-full">
        {activeSection === 'history' ? <ChatHistoryPanel /> : <SettingsPanel />}
      </div>
    </div>
  );
}