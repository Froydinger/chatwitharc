import { Transition } from '@/components/transitions/Transition';
import { Bell,X } from 'lucide-react';
import { GlassButton } from '@/components/ui/glass-button';

export function NotificationPromptView({show,loading,handleEnable,handleDismiss,handleHideForever}:{show:boolean;loading:boolean;handleEnable:()=>void;handleDismiss:()=>void;handleHideForever:()=>void}){
  return (
    <Transition show={show} preset="panel"><div
        className="fixed bottom-32 left-4 right-4 z-50 md:left-auto md:right-8 md:w-80"
      >
        <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl p-4 shadow-xl">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 rounded-lg p-2">
              <Bell className="h-5 w-5 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground mb-1">
                Turn on notifications
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                Get pinged when scheduled tasks finish or someone @mentions you in a Collab Chat.
              </p>

              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <GlassButton
                    variant="glow"
                    size="sm"
                    onClick={handleEnable}
                    disabled={loading}
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    {loading ? "Enabling…" : "Enable"}
                  </GlassButton>

                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={handleDismiss}
                    className="border border-border"
                    aria-label="Dismiss for 7 days"
                  >
                    <X className="h-4 w-4" />
                  </GlassButton>
                </div>
                <button
                  onClick={handleHideForever}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors text-left"
                >
                  Don't show again
                </button>
              </div>
            </div>
          </div>
        </div>
      </div></Transition>
  );
}
