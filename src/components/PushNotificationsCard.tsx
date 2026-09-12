import { Bell, BellOff, Loader2, Smartphone, Monitor, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

function notificationErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

export function PushNotificationsCard() {
  const {
    supported,
    permission,
    subscribed,
    loading,
    availabilityReason,
    needsIOSInstall,
    needsMacInstall,
    subscribe,
    unsubscribe,
    sendTest,
  } = usePushNotifications();
  const notifyGlyphRef = useRef<HTMLSpanElement>(null);
  const notifyLabelRef = useRef<HTMLSpanElement>(null);
  const wasSubscribedRef = useRef(subscribed);
  const [notifyLabelWidth, setNotifyLabelWidth] = useState<number>();

  useLayoutEffect(() => {
    const activeLabel = notifyLabelRef.current?.querySelector<HTMLElement>('[data-show="true"]');
    if (activeLabel) setNotifyLabelWidth(activeLabel.offsetWidth);
  }, [subscribed]);

  useEffect(() => {
    if (!wasSubscribedRef.current && subscribed) {
      const glyph = notifyGlyphRef.current;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (glyph && !reducedMotion) {
        glyph.getAnimations().forEach((animation) => animation.cancel());
        glyph.animate(
          [
            { transform: "rotate(0deg)" },
            { transform: "rotate(-17deg)", offset: 0.11 },
            { transform: "rotate(14deg)", offset: 0.27 },
            { transform: "rotate(-9deg)", offset: 0.44 },
            { transform: "rotate(6deg)", offset: 0.61 },
            { transform: "rotate(-3deg)", offset: 0.78 },
            { transform: "rotate(0deg)" },
          ],
          { duration: 820, easing: "ease-out" },
        );
      }
    }

    wasSubscribedRef.current = subscribed;
  }, [subscribed]);

  const handleToggle = async (next: boolean) => {
    try {
      if (next) {
        await subscribe();
        toast.success("Push notifications enabled — check for the welcome ping!");
      } else {
        await unsubscribe();
        toast.success("Push notifications disabled");
      }
    } catch (error: unknown) {
      toast.error(notificationErrorMessage(error, "Couldn't update push notifications"));
    }
  };

  const handleTest = async () => {
    try {
      await sendTest();
      toast.success("Test notification sent");
    } catch (error: unknown) {
      toast.error(notificationErrorMessage(error, "Couldn't send test notification"));
    }
  };

  const denied = permission === "denied";
  const canToggle = supported && !denied && !needsIOSInstall && !needsMacInstall;

  return (
    <div className="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md p-4 sm:p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          {subscribed ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Push Notifications</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Get pinged when scheduled tasks finish, someone @mentions you in a shared chat, or important updates land.
          </p>
        </div>
        {canToggle && (
          <button
            type="button"
            onClick={() => void handleToggle(!subscribed)}
            onPointerDown={(event) => event.stopPropagation()}
            disabled={loading}
            aria-pressed={subscribed}
            aria-label={subscribed ? "Disable push notifications" : "Enable push notifications"}
            aria-busy={loading}
            data-on={subscribed}
            className={
              "group inline-flex h-10 shrink-0 items-center gap-2 self-start rounded-full border px-4 text-xs font-semibold transition-[background-color,border-color,box-shadow,color,transform] duration-200 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none sm:self-auto " +
              (subscribed
                ? "border-primary/45 bg-primary/12 text-foreground shadow-[0_8px_24px_-16px_hsl(var(--primary)/0.85)] hover:bg-primary/18"
                : "border-border/55 bg-muted/25 text-muted-foreground hover:border-primary/40 hover:bg-primary/8 hover:text-foreground")
            }
          >
            <span
              ref={notifyGlyphRef}
              className={cn(
                "grid h-5 w-5 shrink-0 origin-[50%_16%] place-items-center transition-colors",
                subscribed ? "text-primary" : "text-muted-foreground group-hover:text-primary",
              )}
              aria-hidden="true"
            >
              <Bell className="h-4 w-4" strokeWidth={2} />
            </span>
            <span
              ref={notifyLabelRef}
              className="relative block h-[18px] overflow-hidden text-left"
              style={notifyLabelWidth ? { width: notifyLabelWidth } : undefined}
              aria-hidden="true"
            >
              <span
                data-show={!subscribed}
                className={cn(
                  "absolute inset-0 whitespace-nowrap leading-[18px] transition-opacity duration-200 motion-reduce:transition-none",
                  subscribed ? "opacity-0" : "opacity-100",
                )}
              >
                Notify me
              </span>
              <span
                data-show={subscribed}
                className={cn(
                  "absolute inset-0 whitespace-nowrap leading-[18px] transition-opacity duration-200 motion-reduce:transition-none",
                  subscribed ? "opacity-100" : "opacity-0",
                )}
              >
                You’ll be notified
              </span>
            </span>
          </button>
        )}
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {availabilityReason === "unsupported-browser" && (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          Push notifications aren't supported in this browser. Try Safari, Chrome, or Edge.
        </p>
      )}

      {needsIOSInstall && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 flex gap-2">
          <Smartphone className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <span>
            On iPhone & iPad, push only works after installing ArcAI to your Home Screen.
            Tap the Share button in Safari and choose <strong>Add to Home Screen</strong>, then
            open Arc from the icon and come back here.
          </span>
        </div>
      )}

      {needsMacInstall && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 flex gap-2">
          <Monitor className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
          <span>
            On macOS Safari, push only works after adding ArcAI to your Dock.
            In Safari, choose <strong>File → Add to Dock</strong>, then open Arc from the Dock icon
            and come back here.
          </span>
        </div>
      )}

      {availabilityReason === "push-service-unavailable" && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
          The browser's push service is still waking up. Leave this open while Arc retries;
          if it still fails, fully close and reopen the installed app once.
        </div>
      )}

      {denied && (
        <div className="text-xs text-muted-foreground bg-destructive/10 border border-destructive/30 rounded-lg p-3">
          Notifications are blocked for this site. Enable them in your browser's site settings,
          then come back and try again.
        </div>
      )}

      {subscribed && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleTest} disabled={loading}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Send test notification
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleToggle(false)} disabled={loading}>
            Disable on this device
          </Button>
        </div>
      )}
    </div>
  );
}
