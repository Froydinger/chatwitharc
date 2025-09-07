import { ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import { useArcStore } from "@/store/useArcStore";
import { useToast } from "@/hooks/use-toast";

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { createNewSession } = useArcStore();
  const { toast } = useToast();

  const handleNewChat = () => {
    createNewSession();
    toast({ 
      title: "New Chat Started", 
      description: "Ready for a fresh conversation!" 
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader onNewChat={handleNewChat} />
      <div className="flex">
        <AppSidebar onNewChat={handleNewChat} />
        <main className="ml-80 flex-1 min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}