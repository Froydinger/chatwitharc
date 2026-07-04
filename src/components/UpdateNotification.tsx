import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export function UpdateNotification() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        setRegistration(reg);

        // Check for updates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setShowUpdate(true);
              }
            });
          }
        });

        // Check for waiting service worker
        if (reg.waiting) {
          setShowUpdate(true);
        }
      }).catch((err) => {
        // Silently ignore service worker errors - not critical
        console.warn('Service worker ready failed:', err);
      });
    }
  }, []);

  const handleUpdate = () => {
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setShowUpdate(false);
  };

  if (!showUpdate) return null;

  return (
    <div className="fixed top-[calc(env(safe-area-inset-top,0px)+1rem)] left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 animate-in fade-in slide-in-from-top-5 duration-300">
      <div className="backdrop-blur-xl bg-background/80 border border-primary/20 rounded-2xl p-4 shadow-[0_12px_32px_rgba(0,0,0,0.4)] relative overflow-hidden">
        {/* Subtle accent border line */}
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-primary/10 via-primary to-primary/10" />
        
        <div className="flex items-start gap-3 mt-1">
          <div className="mt-0.5 px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase rounded bg-primary/10 text-primary border border-primary/20">
            Update
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              App Update Available
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              A new version of ArcAI is ready. Refresh to get the latest features.
            </p>
            <div className="flex gap-2 mt-3">
              <Button 
                size="sm" 
                onClick={handleUpdate}
                className="rounded-xl font-medium px-4 h-8 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20"
              >
                Refresh
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleDismiss}
                className="rounded-xl font-medium px-3 h-8 text-muted-foreground hover:text-foreground hover:bg-muted/30"
              >
                Later
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}