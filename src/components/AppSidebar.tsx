import { MessageCircle, Settings, History, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useArcStore } from "@/store/useArcStore";

const navigationItems = [
  { id: "chat", icon: MessageCircle, label: "Chat", description: "AI Conversation" },
  { id: "history", icon: History, label: "History", description: "Past Conversations" },
  { id: "settings", icon: Settings, label: "Settings", description: "App Preferences" },
] as const;

interface AppSidebarProps {
  onNewChat: () => void;
}

export function AppSidebar({ onNewChat }: AppSidebarProps) {
  const { currentTab, setCurrentTab } = useArcStore();

  return (
    <aside className="fixed left-0 top-16 z-40 w-80 h-[calc(100vh-4rem)] border-r border-border/40 bg-card/50 backdrop-blur-xl">
      <div className="flex flex-col h-full p-6">
        {/* New Chat Button */}
        <Button
          onClick={onNewChat}
          className="w-full mb-6 h-12 glass-glow text-lg"
          size="lg"
        >
          <Plus className="h-5 w-5 mr-3" />
          Start New Chat
        </Button>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all text-left ${
                currentTab === item.id
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <div>
                <div className="font-medium">{item.label}</div>
                <div className="text-sm opacity-70">{item.description}</div>
              </div>
            </button>
          ))}
        </nav>

        {/* App Info */}
        <div className="mt-auto pt-6 border-t border-border/20">
          <div className="flex items-center gap-3">
            <img
              src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
              alt="ArcAI"
              className="h-10 w-10"
            />
            <div>
              <div className="font-medium text-foreground">ArcAI</div>
              <div className="text-sm text-muted-foreground">Version 2.0</div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}