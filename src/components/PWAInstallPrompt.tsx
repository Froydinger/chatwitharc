import { NotificationPromptView } from "@/components/NotificationPromptView";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";

const DISMISS_KEY = "push-prompt-dismissed-at";
const FOREVER_KEY = "push-prompt-hidden-forever";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function PWAInstallPrompt() {
  const { user } = useAuth();
  const {
    supported,
    subscribed,
    permission,
    loading,
    availabilityReason,
    subscribe,
  } = usePushNotifications();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) {
      setShow(false);
      return;
    }
    // Directly check browser Notification API: if already granted or denied, NEVER prompt!
    if (typeof window !== "undefined" && typeof Notification !== "undefined" && Notification.permission !== "default") {
      setShow(false);
      return;
    }
    // If user already enabled or opted out, never prompt
    if (
      typeof window !== "undefined" &&
      (localStorage.getItem("push-prompt-enabled") === "true" ||
        localStorage.getItem("arcai-desktop-notifications-enabled") === "true" ||
        localStorage.getItem(FOREVER_KEY) === "true")
    ) {
      setShow(false);
      return;
    }
    if (!supported || subscribed) {
      setShow(false);
      return;
    }
    if (permission !== "default") {
      setShow(false);
      return;
    }
    if (availabilityReason !== "ready") {
      setShow(false);
      return;
    }
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
    if (dismissedAt && Date.now() - dismissedAt < COOLDOWN_MS) {
      setShow(false);
      return;
    }

    const t = window.setTimeout(() => setShow(true), 2500);
    return () => window.clearTimeout(t);
  }, [user, supported, subscribed, permission, availabilityReason]);

  const handleEnable = async () => {
    try {
      localStorage.setItem("push-prompt-enabled", "true");
      await subscribe();
      toast.success("Push enabled — check for the welcome ping!");
      setShow(false);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't enable push");
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setShow(false);
  };

  const handleHideForever = () => {
    localStorage.setItem(FOREVER_KEY, "true");
    setShow(false);
  };

  // Immediate synchronous bail out if already granted or previously enabled
  if (
    typeof window !== "undefined" &&
    ((typeof Notification !== "undefined" && Notification.permission !== "default") ||
      localStorage.getItem("push-prompt-enabled") === "true" ||
      localStorage.getItem("arcai-desktop-notifications-enabled") === "true" ||
      localStorage.getItem(FOREVER_KEY) === "true")
  ) {
    return null;
  }

  return <NotificationPromptView show={show} loading={loading} handleEnable={handleEnable} handleDismiss={handleDismiss} handleHideForever={handleHideForever} />;
}
