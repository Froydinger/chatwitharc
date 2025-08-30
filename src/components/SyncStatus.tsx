import { useState, useEffect } from "react";
import { Wifi, WifiOff, Cloud, CloudOff } from "lucide-react";
import { useArcStore } from "@/store/useArcStore";
import { useAuth } from "@/hooks/useAuth";

export function SyncStatus() {
  const { user } = useAuth();
  const { lastSyncAt } = useArcStore();
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!user) return null;

  const getSyncStatus = () => {
    if (!isOnline) {
      return { 
        icon: WifiOff, 
        color: "text-destructive", 
        text: "Offline" 
      };
    }
    
    if (!lastSyncAt) {
      return { 
        icon: CloudOff, 
        color: "text-muted-foreground", 
        text: "Syncing..." 
      };
    }

    const timeSinceSync = Date.now() - lastSyncAt.getTime();
    if (timeSinceSync < 5000) {
      return { 
        icon: Cloud, 
        color: "text-green-400", 
        text: "Synced" 
      };
    }

    return { 
      icon: Cloud, 
      color: "text-primary-glow", 
      text: "Auto-sync" 
    };
  };

  const { icon: Icon, color, text } = getSyncStatus();

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 flex items-center gap-2 glass px-3 py-1 rounded-full text-xs">
      <Icon className={`h-3 w-3 ${color}`} />
      <span className={color}>{text}</span>
    </div>
  );
}