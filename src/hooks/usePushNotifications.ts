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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type PushPermission = NotificationPermission | "unsupported";
export type PushAvailabilityReason =
  | "ready"
  | "unsupported-browser"
  | "ios-needs-install"
  | "macos-needs-install"
  | "permission-denied"
  | "push-service-unavailable";

function detectPlatform() {
  if (typeof window === "undefined") {
    return { isIOS: false, isMacSafari: false, isStandalone: false };
  }
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
  // iPadOS 13+ reports as Mac — detect via touch points
  const isIPadOS = navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1;
  const isMac = /Macintosh/.test(ua) && !isIPadOS;
  const isSafari = /^((?!chrome|android|edg|crios|fxios).)*safari/i.test(ua);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true;
  return {
    isIOS: isIOS || isIPadOS,
    isMacSafari: isMac && isSafari,
    isStandalone,
  };
}

export function usePushNotifications() {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<PushPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availabilityReason, setAvailabilityReason] =
    useState<PushAvailabilityReason>("ready");
  const platform = detectPlatform();

  const computeAvailability = useCallback((): PushAvailabilityReason => {
    if (typeof window === "undefined") return "unsupported-browser";
    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNotif = "Notification" in window;
    if (!hasSW || !hasPush || !hasNotif) return "unsupported-browser";
    if (platform.isIOS && !platform.isStandalone) return "ios-needs-install";
    // macOS Safari requires the app installed to the Dock for push (Safari 16.4+).
    if (platform.isMacSafari && !platform.isStandalone) return "macos-needs-install";
    if (typeof Notification !== "undefined" && Notification.permission === "denied")
      return "permission-denied";
    return "ready";
  }, [platform.isIOS, platform.isMacSafari, platform.isStandalone]);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const reason = computeAvailability();
    setAvailabilityReason(reason);
    const ok = reason !== "unsupported-browser";
    setSupported(ok);
    if (!ok) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    try {
      // Make sure we read from the active SW, not a stale registration.
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setSubscribed(!!sub);
    } catch {
      setSubscribed(false);
    }
  }, [computeAvailability]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      const reason = computeAvailability();
      setAvailabilityReason(reason);
      if (reason === "unsupported-browser") {
        throw new Error("Push notifications aren't supported in this browser.");
      }
      if (reason === "ios-needs-install") {
        throw new Error(
          "On iPhone & iPad, install ArcAI to your Home Screen first (Share → Add to Home Screen), then open it from the icon.",
        );
      }
      if (reason === "macos-needs-install") {
        throw new Error(
          "On macOS Safari, add ArcAI to your Dock first (File → Add to Dock), then open it from there.",
        );
      }

      // Make sure the SW is registered AND active.
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.register("/sw.js");
      reg = await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setAvailabilityReason("permission-denied");
        throw new Error("Notification permission was not granted.");
      }

      // Some platforms (iOS PWA, fresh installs) throw AbortError for ~1s after
      // the SW activates. Retry a few times before giving up.
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        let lastErr: any = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });
            break;
          } catch (err: any) {
            lastErr = err;
            const msg = String(err?.message ?? "");
            const transient =
              err?.name === "AbortError" ||
              /push service/i.test(msg) ||
              /not available/i.test(msg);
            if (!transient || attempt === 3) throw err;
            await sleep(600 * (attempt + 1));
          }
        }
        if (!sub) throw lastErr ?? new Error("Could not subscribe to push service.");
      }

      const { error } = await supabase.functions.invoke("register-push-subscription", {
        body: { subscription: sub.toJSON(), userAgent: navigator.userAgent },
      });
      if (error) throw error;

      setSubscribed(true);

      // Fire a welcome notification so the user sees push working immediately.
      try {
        await supabase.functions.invoke("send-welcome-push", {});
      } catch (e) {
        // Non-fatal — welcome push failure shouldn't block subscription
        console.warn("welcome push failed:", e);
      }

      return true;
    } catch (e: any) {
      const msg = String(e?.message ?? "");
      if (/push service/i.test(msg) || /not available/i.test(msg)) {
        setAvailabilityReason("push-service-unavailable");
      }
      throw e;
    } finally {
      setLoading(false);
    }
  }, [computeAvailability]);

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

  const sendTest = useCallback(async () => {
    const { error } = await supabase.functions.invoke("send-welcome-push", {
      body: { test: true },
    });
    if (error) throw error;
  }, []);

  return {
    supported,
    permission,
    subscribed,
    loading,
    availabilityReason,
    isStandalone: platform.isStandalone,
    isIOS: platform.isIOS,
    isMacSafari: platform.isMacSafari,
    needsIOSInstall: availabilityReason === "ios-needs-install",
    needsMacInstall: availabilityReason === "macos-needs-install",
    subscribe,
    unsubscribe,
    sendTest,
    refresh,
  };
}
