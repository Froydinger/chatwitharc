import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Public VAPID key — safe to ship in the client (that's the whole point of VAPID).
const VAPID_PUBLIC_KEY =
  "BB_eg9kxkjqOLLkwKDQhiuNPXtdHRbcQEQXvkROOxHDWFla5mhghTc59na3wIbs43WMsMqkQPxBQ6RSTO_BMx2o";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export type PushPermission = NotificationPermission | "unsupported";

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PushPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNotif = "Notification" in window;
    const ok = hasSW && hasPush && hasNotif;
    setSupported(ok);
    if (!ok) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setSubscribed(false);
    }
  }, []);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
    setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream);
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Push notifications aren't supported on this device.");
      }

      // Ensure SW is registered (it's registered in index.html, but be safe).
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") throw new Error("Notification permission was not granted.");

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const { error } = await supabase.functions.invoke("register-push-subscription", {
        body: { subscription: sub.toJSON(), userAgent: navigator.userAgent },
      });
      if (error) throw error;

      setSubscribed(true);
      return true;
    } finally {
      setLoading(false);
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setLoading(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await supabase.functions.invoke("unregister-push-subscription", {
          body: { endpoint },
        });
      }
      setSubscribed(false);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    supported,
    permission,
    subscribed,
    loading,
    isStandalone,
    isIOS,
    /** iOS Safari only allows push when installed to the home screen */
    needsIOSInstall: isIOS && !isStandalone,
    subscribe,
    unsubscribe,
    refresh,
  };
}
