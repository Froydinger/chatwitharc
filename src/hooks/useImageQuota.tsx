import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const DAILY_IMAGE_OUTPUT_LIMIT = 20;

import { useImageGenStore, useResolvedImageModel } from "@/store/useImageGenStore";
import { useSubscription } from "@/hooks/useSubscription";

interface ImageQuotaSnapshot {
  used: number;
  remaining: number | null;
  limit: number | null;
  isAdmin: boolean;
  resetAt: string;
}

interface ImageQuotaState {
  loading: boolean;
  isAdmin: boolean;
  dailyImagesUsed: number;
  remainingImages: number;
  limit: number;
  canGenerateImage: boolean;
  resetAt: string | null;
  refreshQuota: () => Promise<void>;
  FREE_DAILY_IMAGE_LIMIT: number;
}

const ImageQuotaContext = createContext<ImageQuotaState | null>(null);

export function ImageQuotaProvider({ children }: { children: React.ReactNode }) {
  const { user, isAnonymous } = useAuth();
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<ImageQuotaSnapshot | null>(null);
  const { hasBoost, isAdmin } = useSubscription();
  const selectedModel = useResolvedImageModel(hasBoost || isAdmin);

  const refreshQuota = useCallback(async () => {
    if (!user || isAnonymous) {
      setQuota(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_image_quota", {
        chosen_model: selectedModel
      });
      if (error) throw error;
      setQuota(data as unknown as ImageQuotaSnapshot);
    } catch (error) {
      console.error("[image-quota] refresh failed", error);
    } finally {
      setLoading(false);
    }
  }, [isAnonymous, selectedModel, user]);

  useEffect(() => { void refreshQuota(); }, [refreshQuota, selectedModel]);

  useEffect(() => {
    const refresh = () => void refreshQuota();
    window.addEventListener("focus", refresh);
    window.addEventListener("arc-image-quota-changed", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("arc-image-quota-changed", refresh);
    };
  }, [refreshQuota]);

  const value = useMemo<ImageQuotaState>(() => {
    const isUnlimited = quota?.isAdmin === true || quota?.remaining === null;
    const remaining = isUnlimited ? Infinity : quota?.remaining ?? 3;
    const limit = isUnlimited ? Infinity : quota?.limit ?? 3;
    return {
      loading,
      isAdmin: quota?.isAdmin === true,
      dailyImagesUsed: quota?.used ?? 0,
      remainingImages: remaining,
      limit,
      canGenerateImage: !isAnonymous && (isUnlimited || remaining > 0),
      resetAt: quota?.resetAt ?? null,
      refreshQuota,
      FREE_DAILY_IMAGE_LIMIT: 3,
    };
  }, [isAnonymous, loading, quota, refreshQuota]);

  return <ImageQuotaContext.Provider value={value}>{children}</ImageQuotaContext.Provider>;
}

export function useImageQuota() {
  const value = useContext(ImageQuotaContext);
  if (!value) throw new Error("useImageQuota must be used within ImageQuotaProvider");
  return value;
}
