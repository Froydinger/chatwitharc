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
    <div className="fixed top-4 right-4 z-50 max-w-sm">
      <div className="bg-card border border-border rounded-lg p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <Badge variant="secondary" className="mt-0.5">
            Update
          </Badge>
          <div className="flex-1">
            <p className="text-sm font-medium mb-2">
              App Update Available
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              A new version of ArcAI is ready. Refresh to get the latest features.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleUpdate}>
                Refresh
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDismiss}>
                Later
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}