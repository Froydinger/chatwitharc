import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DesktopNotificationDelivery } from "@/lib/desktopNotificationDelivery";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type DesktopNotificationBridge = {
  getDeviceId: () => Promise<string>;
  enable: () => Promise<{ ok: boolean; error?: string }>;
  show: (payload: { title: string; body?: string; url?: string; tag?: string }) => Promise<{ ok: boolean; error?: string }>;
};

const DESKTOP_NOTIFICATIONS_KEY = "arcai-desktop-notifications-enabled";

function getDesktopNotificationBridge(): DesktopNotificationBridge | null {
  if (typeof window === "undefined" || !/ArcAIInternalAuth\//i.test(navigator.userAgent)) return null;
  return (window as typeof window & {
    arcaiDesktop?: { notifications?: DesktopNotificationBridge };
  }).arcaiDesktop?.notifications ?? null;
}

// These tables predate the generated application schema; keep their narrow API typed here.
type DesktopNotificationRow = {
  id: string; user_id: string; title: string; body: string; url: string;
  tag: string | null; created_at: string; delivered_at: string | null;
};
type DesktopDeviceRow = {
  device_id: string; user_id: string; enabled: boolean; last_seen_at: string; created_at: string;
};
type DesktopDatabase = {
  public: {
    Tables: {
      desktop_notifications: {
        Row: DesktopNotificationRow;
        Insert: never;
        Update: { delivered_at?: string | null };
        Relationships: [];
      };
      desktop_notification_devices: {
        Row: DesktopDeviceRow;
        Insert: Omit<DesktopDeviceRow, "created_at">;
        Update: Partial<DesktopDeviceRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
};
const desktopClient = supabase as unknown as SupabaseClient<DesktopDatabase>;

let desktopChannelGeneration = 0;
const desktopDelivery = new DesktopNotificationDelivery({
  enabled: () => getDesktopNotificationBridge() !== null && localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) === "true",
  online: () => navigator.onLine !== false,
  owner: async () => (await supabase.auth.getSession()).data.session?.user.id ?? null,
  onOwner: (callback) => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user.id ?? null));
    return () => subscription.unsubscribe();
  },
  onWake: (callback) => {
    const onVisible = () => { if (document.visibilityState === "visible") callback(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === DESKTOP_NOTIFICATIONS_KEY || event.key === null) callback();
    };
    window.addEventListener("focus", callback);
    window.addEventListener("online", callback);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", callback);
      window.removeEventListener("online", callback);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  },
  connect: (owner, callbacks) => {
    // A unique topic avoids reusing a channel whose asynchronous leave is still pending.
    const channel = supabase.channel(`desktop-notifications:${owner}:${++desktopChannelGeneration}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "desktop_notifications", filter: `user_id=eq.${owner}`,
      }, callbacks.change)
      .on("system", {}, callbacks.system)
      .subscribe(callbacks.status);
    return () => { void supabase.removeChannel(channel).catch(() => undefined); };
  },
  pending: async (owner, limit, signal) => {
    const { data, error } = await desktopClient.from("desktop_notifications")
      .select("id,user_id,title,body,url,tag").eq("user_id", owner).is("delivered_at", null)
      .order("created_at", { ascending: true }).limit(limit).abortSignal(signal);
    if (error) throw error;
    return data ?? [];
  },
  claim: async (owner, id, signal) => {
    const { data, error } = await desktopClient.from("desktop_notifications")
      .update({ delivered_at: new Date().toISOString() }).eq("user_id", owner).eq("id", id)
      .is("delivered_at", null).select("id").abortSignal(signal).maybeSingle();
    if (error) throw error;
    return !!data;
  },
  show: async (item) => getDesktopNotificationBridge()?.show({ ...item, tag: item.tag ?? undefined }),
  register: async (owner, signal) => {
    const deviceId = await getDesktopNotificationBridge()?.getDeviceId();
    if (!deviceId || signal.aborted) return;
    await desktopClient.from("desktop_notification_devices").upsert({
      device_id: deviceId, user_id: owner, enabled: true, last_seen_at: new Date().toISOString(),
    }).abortSignal(signal);
  },
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: (timer) => clearTimeout(timer),
});

let vapidPublicKeyPromise: Promise<string> | null = null;

async function getVapidPublicKey() {
  if (!vapidPublicKeyPromise) {
    vapidPublicKeyPromise = supabase.functions
      .invoke<{ publicKey?: string }>("get-vapid-public-key", { body: {} })
      .then(({ data, error }) => {
        if (error || !data?.publicKey) {
          throw new Error("Push configuration is temporarily unavailable.");
        }
        return data.publicKey;
      });
  }
  return vapidPublicKeyPromise;
}

function isTransientPushError(err: any) {
  const msg = String(err?.message ?? "");
  return (
    err?.name === "AbortError" ||
    /push service/i.test(msg) ||
    /not available/i.test(msg) ||
    /registration failed/i.test(msg)
  );
}

function waitForState(worker: ServiceWorker, state: ServiceWorkerState) {
  if (worker.state === state) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Service worker activation timed out")), 10000);
    worker.addEventListener("statechange", () => {
      if (worker.state === state) {
        window.clearTimeout(timeout);
        resolve();
      }
    });
  });
}

function subscriptionUsesKey(sub: PushSubscription, keyBytes: Uint8Array) {
  const existing = sub.options?.applicationServerKey;
  if (!existing) return true;
  const source = existing as unknown;
  const existingBytes = ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source as ArrayBuffer);
  if (existingBytes.length !== keyBytes.length) return false;
  return existingBytes.every((value, index) => value === keyBytes[index]);
}

async function ensurePushRegistration(repair = false) {
  if (repair) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister().catch(() => false)));
    await sleep(900);
  }

  let reg = await navigator.serviceWorker.getRegistration("/");
  if (!reg) {
    reg = await navigator.serviceWorker.register("/sw.js", {
      scope: "/",
      updateViaCache: "none",
    });
  } else {
    try {
      await reg.update();
    } catch {
      // Updating is best-effort; ready below is the important part.
    }
  }

  const activatingWorker = reg.installing || reg.waiting;
  if (activatingWorker && activatingWorker.state !== "activated") {
    await waitForState(activatingWorker, "activated").catch(() => undefined);
  }

  return navigator.serviceWorker.ready;
}

async function showLocalPushProof(
  title: string,
  options: NotificationOptions & { url?: string },
) {
  if (typeof window === "undefined" || Notification.permission !== "granted") return;
  try {
    const reg = await ensurePushRegistration(false);
    await reg.showNotification(title, {
      body: options.body,
      icon: options.icon || "/icons/apple-touch-icon-180.png",
      badge: options.badge || "/icons/apple-touch-icon-180.png",
      tag: options.tag,
      data: { url: options.url || "/" },
      requireInteraction: options.requireInteraction || false,
      silent: options.silent || false,
    });
  } catch {
    // Local proof is best-effort; the real push subscription still matters.
  }
}

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
  const [supported, setSupported] = useState(() => {
    if (typeof window === "undefined") return false;
    return getDesktopNotificationBridge() !== null || ("Notification" in window && "serviceWorker" in navigator);
  });
  const [permission, setPermission] = useState<PushPermission>(() => {
    if (typeof window === "undefined") return "default";
    const desktopBridge = getDesktopNotificationBridge();
    if (desktopBridge) {
      return localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) === "true" ? "granted" : "default";
    }
    if (typeof Notification !== "undefined" && Notification.permission) {
      return Notification.permission as PushPermission;
    }
    return "default";
  });
  const [subscribed, setSubscribed] = useState(() => {
    if (typeof window === "undefined") return false;
    if (localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) === "true") return true;
    if (localStorage.getItem("push-prompt-enabled") === "true") return true;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") return true;
    return false;
  });
  const [loading, setLoading] = useState(false);
  const [availabilityReason, setAvailabilityReason] =
    useState<PushAvailabilityReason>("ready");
  const platform = detectPlatform();

  const computeAvailability = useCallback((): PushAvailabilityReason => {
    if (typeof window === "undefined") return "unsupported-browser";
    if (getDesktopNotificationBridge()) return "ready";
    const hasSW = "serviceWorker" in navigator;
    const hasPush = "PushManager" in window;
    const hasNotif = "Notification" in window;
    if (!hasSW || !hasPush || !hasNotif) return "unsupported-browser";
    // iOS still requires installing to Home Screen before push works (Apple constraint).
    if (platform.isIOS && !platform.isStandalone) return "ios-needs-install";
    // macOS Safari 16.4+ and all desktop browsers (Chrome/Edge/Firefox/Safari)
    // support web push on regular websites — no install-to-Dock required.
    if (typeof Notification !== "undefined" && Notification.permission === "denied")
      return "permission-denied";
    return "ready";
  }, [platform.isIOS, platform.isStandalone]);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const desktopBridge = getDesktopNotificationBridge();
    if (desktopBridge) {
      const enabled = localStorage.getItem(DESKTOP_NOTIFICATIONS_KEY) === "true";
      setAvailabilityReason("ready");
      setSupported(true);
      setPermission(enabled ? "granted" : "default");
      setSubscribed(enabled);
      desktopDelivery.refresh();
      return;
    }
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
      if (!sub) {
        setSubscribed(false);
      } else {
        const publicKey = await getVapidPublicKey();
        setSubscribed(subscriptionUsesKey(sub, urlBase64ToUint8Array(publicKey)));
      }
    } catch {
      setSubscribed(false);
    }
  }, [computeAvailability]);

  useEffect(() => {
    if (getDesktopNotificationBridge()) return desktopDelivery.acquire();
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setLoading(true);
    try {
      const desktopBridge = getDesktopNotificationBridge();
      if (desktopBridge) {
        const result = await desktopBridge.enable();
        if (!result?.ok) throw new Error(result?.error || "macOS did not enable notifications.");
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sign in before enabling notifications.");
        const deviceId = await desktopBridge.getDeviceId();
        const { error } = await desktopClient.from("desktop_notification_devices").upsert({
          device_id: deviceId,
          user_id: user.id,
          enabled: true,
          last_seen_at: new Date().toISOString(),
        });
        if (error) throw error;
        localStorage.setItem(DESKTOP_NOTIFICATIONS_KEY, "true");
        setPermission("granted");
        setSubscribed(true);
        desktopDelivery.refresh();
        return true;
      }

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

      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setAvailabilityReason("permission-denied");
        throw new Error("Notification permission was not granted.");
      }

      const publicKey = await getVapidPublicKey();
      const publicKeyBytes = urlBase64ToUint8Array(publicKey);
      let sub: PushSubscription | null = null;
      let lastErr: any = null;

      // Safari PWAs can keep a broken registration after install/update. Retry
      // with increasing waits, then rebuild the SW registration once before the
      // final attempts so users don't get stuck forever on Apple's push service.
      for (let attempt = 0; attempt < 8 && !sub; attempt++) {
        try {
          const reg = await ensurePushRegistration(attempt === 4);
          sub = await reg.pushManager.getSubscription();
          if (sub && !subscriptionUsesKey(sub, publicKeyBytes)) {
            await sub.unsubscribe().catch(() => false);
            sub = null;
          }
          if (!sub) {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: publicKeyBytes,
            });
          }
        } catch (err: any) {
          lastErr = err;
          if (!isTransientPushError(err) || attempt === 7) throw err;
          await sleep(1000 * (attempt + 1));
        }
      }

      if (!sub) throw lastErr ?? new Error("Could not subscribe to push service.");

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
      const desktopBridge = getDesktopNotificationBridge();
      if (desktopBridge) {
        // Fence queued/in-flight alerts as soon as the user disables delivery.
        localStorage.removeItem(DESKTOP_NOTIFICATIONS_KEY);
        desktopDelivery.refresh();
        setPermission("default");
        setSubscribed(false);
        const deviceId = await desktopBridge.getDeviceId();
        await desktopClient
          .from("desktop_notification_devices")
          .delete()
          .eq("device_id", deviceId);
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration("/");
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
