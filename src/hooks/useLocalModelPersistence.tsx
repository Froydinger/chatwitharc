import { useEffect } from "react";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import { getCachedLocalModels } from "@/services/localAI";

/**
 * Keeps the local on-device model marked correctly across refreshes/PWA reloads
 * and app resume (visibilitychange). Reconciles persisted Zustand state against
 * what's actually in IndexedDB so the UI never shows a stale "not downloaded".
 *
 *   - Probes IndexedDB on mount and every time the tab becomes visible.
 *   - If ANY model is cached → status='ready', auto-select first cached if needed.
 *   - Only flips to 'idle' when zero models are cached AND we previously thought
 *     a model was ready (i.e. true eviction).
 *   - Requests persistent storage; warns once if denied (Safari/Electron).
 */
export function useLocalModelPersistence() {
  useEffect(() => {
    let cancelled = false;
    let warnedAboutPersist = false;

    const requestPersistOnce = async () => {
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.storage &&
          typeof navigator.storage.persist === "function"
        ) {
          const already = await navigator.storage.persisted?.();
          if (!already) {
            const granted = await navigator.storage.persist();
            console.log("[LocalAI] Persistent storage granted:", granted);
            if (!granted && !warnedAboutPersist) {
              warnedAboutPersist = true;
              console.warn(
                "[LocalAI] Browser did not grant persistent storage. " +
                  "On-device model weights may be evicted under storage pressure (Safari/iOS especially)."
              );
            }
          }
        }
      } catch (e) {
        console.warn("[LocalAI] persist() failed:", e);
      }
    };

    const reconcile = async () => {
      try {
        const {
          selectedModelId,
          status,
          setStatus,
          setSelectedModelId,
          setProgress,
        } = useLocalAIStore.getState();

        const cached = await getCachedLocalModels();
        if (cancelled) return;

        const anyCached = Object.values(cached).some(Boolean);
        const selectedStillCached =
          !!selectedModelId && cached[selectedModelId] === true;

        if (anyCached) {
          // We have weights on disk — make sure the UI knows.
          if (!selectedStillCached) {
            const firstCached = Object.keys(cached).find((id) => cached[id]);
            if (firstCached) setSelectedModelId(firstCached);
          }
          if (status !== "ready" && status !== "loading") {
            setStatus("ready");
            setProgress(1, "Ready");
          }
        } else if (status === "ready") {
          // Truly evicted — show download UI again.
          console.warn("[LocalAI] All cached weights are gone — resetting to idle.");
          setStatus("idle");
          setProgress(0, "");
        }
      } catch (e) {
        console.warn("[LocalAI] reconciliation failed:", e);
      }
    };

    requestPersistOnce();
    reconcile();

    const onVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        reconcile();
      }
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, []);
}
