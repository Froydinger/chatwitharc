import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  onNewChat: () => void;
}

export function AppHeader({ onNewChat }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <img
            src="/lovable-uploads/72a60af7-4760-4f2e-9000-1ca90800ae61.png"
            alt="ArcAI"
            className="h-8 w-8"
          />
          <div>
            <h1 className="text-xl font-semibold text-foreground">ArcAI</h1>
            <p className="text-sm text-muted-foreground">AI Assistant</p>
          </div>
        </div>
        
        <Button
          variant="outline"
          size="sm"
          onClick={onNewChat}
          className="glass-glow"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>
    </header>
  );
}