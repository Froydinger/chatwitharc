import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const FREE_DAILY_IMAGE_CREDITS = 8;

import { useImageGenStore, useResolvedImageModel } from "@/store/useImageGenStore";
import { useSubscription } from "@/hooks/useSubscription";

interface ImageQuotaSnapshot {
  used: number;
  remaining: number | null;
  limit: number | null;
  isBoost: boolean;
  usage_percent: number;
  resetAt: string;
}

interface ImageQuotaState {
  loading: boolean;
  creditsUsed: number;
  remainingCredits: number;
  creditLimit: number;
  usagePercent: number;
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
  const [quota, setQuota] = useState<(ImageQuotaSnapshot & { ownerId: string }) | null>(null);
  const { hasBoost, isAdmin } = useSubscription();
  const selectedModel = useResolvedImageModel(hasBoost || isAdmin);
  const count = useImageGenStore(state => state.count);

  const refreshQuota = useCallback(async () => {
    if (!user || isAnonymous) {
      setQuota(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_arc_image_credits");
      if (error) throw error;
      setQuota({ ...(data as unknown as ImageQuotaSnapshot), ownerId: user.id });
    } catch (error) {
      setQuota(null);
      console.error("[image-quota] refresh failed", error);
    } finally {
      setLoading(false);
    }
  }, [isAnonymous, user]);

  useEffect(() => { void refreshQuota(); }, [refreshQuota]);

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
    const snapshot = quota?.ownerId === user?.id ? quota : null;
    const isUnlimited = snapshot?.isBoost === true || snapshot?.remaining === null;
    const remaining = isUnlimited ? Infinity : snapshot?.remaining ?? 0;
    const limit = isUnlimited ? Infinity : snapshot?.limit ?? FREE_DAILY_IMAGE_CREDITS;
    const unitCost = selectedModel === 'gemini-3.1-flash-image' ? 2 : 1;
    return {
      loading,
      isAdmin,
      creditsUsed: snapshot?.used ?? 0,
      remainingCredits: remaining,
      creditLimit: limit,
      usagePercent: snapshot?.usage_percent ?? 0,
      // Compatibility for existing meters: these fields now represent shared credits.
      dailyImagesUsed: snapshot?.used ?? 0,
      remainingImages: isUnlimited ? Infinity : Math.floor(remaining / unitCost),
      limit,
      canGenerateImage: !!user && !isAnonymous && (isUnlimited || remaining >= unitCost * count),
      resetAt: snapshot?.resetAt ?? null,
      refreshQuota,
      FREE_DAILY_IMAGE_LIMIT: FREE_DAILY_IMAGE_CREDITS,
    };
  }, [count, isAdmin, isAnonymous, loading, quota, refreshQuota, selectedModel, user]);

  return <ImageQuotaContext.Provider value={value}>{children}</ImageQuotaContext.Provider>;
}

export function useImageQuota() {
  const value = useContext(ImageQuotaContext);
  if (!value) throw new Error("useImageQuota must be used within ImageQuotaProvider");
  return value;
}
