import { useEffect } from "react";
import { useLocalAIStore } from "@/store/useLocalAIStore";
import {
  findCachedLocalModel,
  getCachedLocalModels,
} from "@/services/localAI";

/**
 * Keeps the local on-device model marked correctly across refreshes/PWA reloads.
 *
 *   1. Asks the browser to mark this origin's storage as persistent so
 *      IndexedDB / Cache Storage (where WebLLM weights live) won't be evicted
 *      under storage pressure — the #1 cause of "I have to redownload".
 *   2. Reconciles the persisted Zustand state against what's actually in
 *      IndexedDB. If the store thinks a model is `ready` but the cache was
 *      evicted, flip back to `idle` so the UI prompts a redownload instead
 *      of silently failing. If a cached model exists but the store forgot,
 *      mark it ready.
 */
export function useLocalModelPersistence() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // 1. Request persistent storage (no-op if already granted or unsupported).
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
          }
        }
      } catch (e) {
        console.warn("[LocalAI] persist() failed:", e);
      }

      // 2. Reconcile store ↔ actual IndexedDB cache.
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

        const selectedStillCached =
          selectedModelId && cached[selectedModelId] === true;

        if (status === "ready" && !selectedStillCached) {
          // Cache was wiped — show the download UI again.
          console.warn(
            "[LocalAI] Cached weights missing for",
            selectedModelId,
            "— resetting to idle."
          );
          setStatus("idle");
          setProgress(0, "");
        } else if (status !== "ready") {
          // Store doesn't know we have weights — recover.
          const found = selectedStillCached
            ? selectedModelId
            : await findCachedLocalModel();
          if (!cancelled && found) {
            setSelectedModelId(found);
            setStatus("ready");
            setProgress(1, "Ready");
          }
        }
      } catch (e) {
        console.warn("[LocalAI] reconciliation failed:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
}
