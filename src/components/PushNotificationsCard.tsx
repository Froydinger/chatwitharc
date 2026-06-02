import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

export function PushNotificationsCard() {
  const {
    supported, permission, subscribed, loading,
    needsIOSInstall, subscribe, unsubscribe,
  } = usePushNotifications();

  const handleToggle = async (next: boolean) => {
    try {
      if (next) {
        await subscribe();
        toast.success("Push notifications enabled");
      } else {
        await unsubscribe();
        toast.success("Push notifications disabled");
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't update push notifications");
    }
  };

  const denied = permission === "denied";

  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          {subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Push Notifications</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get notified about scheduled tasks, mentions in shared chats, and important updates.
          </p>
        </div>
        {supported && !denied && !needsIOSInstall && (
          <Switch
            checked={subscribed}
            disabled={loading}
            onCheckedChange={handleToggle}
          />
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {!supported && (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          Push notifications aren't supported in this browser.
        </p>
      )}

      {needsIOSInstall && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 flex gap-2">
          <Smartphone className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <span>
            On iPhone & iPad, push notifications only work after installing ArcAI to your Home Screen.
            Tap the Share button in Safari and choose <strong>Add to Home Screen</strong>, then open Arc from the icon.
          </span>
        </div>
      )}

      {denied && (
        <div className="text-xs text-muted-foreground bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          Notifications are blocked for this site. Enable them in your browser's site settings, then come back and try again.
        </div>
      )}

      {subscribed && (
        <Button variant="ghost" size="sm" onClick={() => handleToggle(false)} disabled={loading}>
          Disable on this device
        </Button>
      )}
    </div>
  );
}
