import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { imageRefillVisible } from "@/lib/imageRefillVisibility";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const FREE_MONTHLY_IMAGE_ALLOWANCE = 30;
export const FREE_DAILY_IMAGE_CREDITS = FREE_MONTHLY_IMAGE_ALLOWANCE;

import { imageCreditCost, useImageGenStore, useResolvedImageModel } from "@/store/useImageGenStore";
import { useSubscription } from "@/hooks/useSubscription";

interface ImageQuotaSnapshot {
  liteAvailable?: boolean;
  unlimitedReason?: string;
  grandfatheredUntil?: string | null;
  used: number;
  remaining: number | null;
  limit: number | null;
  isBoost: boolean;
  unlimited: boolean;
  refillEnabled: boolean;
  canRefill: boolean;
  baseRemaining: number;
  bonusRemaining: number;
  refillOffers: { id: string; title: string; endsAt: string }[];
  usage_percent: number;
  resetAt: string;
}

interface ImageQuotaState {
  showRefill: boolean;
  liteAvailable: boolean;
  unlimitedReason: string | null;
  grandfatheredUntil: string | null;
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
  refillEnabled: boolean;
  canRefill: boolean;
  baseRemaining: number;
  bonusRemaining: number;
  refillOffers: { id: string; title: string; endsAt: string }[];
  claimRefill: (offerId?: string) => Promise<void>;
  unitCost: number;
}

const ImageQuotaContext = createContext<ImageQuotaState | null>(null);

export function ImageQuotaProvider({ children }: { children: React.ReactNode }) {
  const { user, isAnonymous } = useAuth();
  const [loading, setLoading] = useState(true);
  const [quota, setQuota] = useState<(ImageQuotaSnapshot & { ownerId: string }) | null>(null);
  const { hasBoost, isAdmin } = useSubscription();
  const selectedModel = useResolvedImageModel(hasBoost || isAdmin);
  const aspect = useImageGenStore(state => state.aspectRatio);
  const mode = useImageGenStore(state => state.imageMode);
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

  const claimRefill = useCallback(async (offerId?: string) => {
    const { error } = await supabase.rpc("claim_arc_image_refill" as never, { claim_key: crypto.randomUUID(), campaign_id: offerId ?? null } as never);
    await refreshQuota();
    if (error) throw new Error(error.message);
  }, [refreshQuota]);
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

  useEffect(() => {
    if (!loading && quota?.ownerId === user?.id && quota?.liteAvailable !== true && mode === 'lite') useImageGenStore.getState().setImageMode('low');
  }, [loading, mode, quota, user]);

  const value = useMemo<ImageQuotaState>(() => {
    const snapshot = quota?.ownerId === user?.id ? quota : null;
    const isUnlimited = snapshot?.unlimited === true;
    const remaining = isUnlimited ? Infinity : snapshot?.remaining ?? 0;
    const limit = isUnlimited ? Infinity : snapshot?.limit ?? FREE_DAILY_IMAGE_CREDITS;
    const unitCost = imageCreditCost(selectedModel, aspect, !hasBoost || mode === 'low' ? 'low' : 'medium');
    return {
      loading,
      showRefill: !!snapshot && imageRefillVisible({loading, isAdmin, remaining, limit}),
      liteAvailable: snapshot?.liteAvailable === true,
      unlimitedReason: snapshot?.unlimitedReason ?? null,
      grandfatheredUntil: snapshot?.grandfatheredUntil ?? null,
      isAdmin,
      refillEnabled: snapshot?.refillEnabled ?? false,
      canRefill: snapshot?.canRefill ?? false,
      baseRemaining: snapshot?.baseRemaining ?? 0,
      bonusRemaining: snapshot?.bonusRemaining ?? 0,
      refillOffers: snapshot?.refillOffers ?? [],
      claimRefill, unitCost,
      creditsUsed: snapshot?.used ?? 0,
      remainingCredits: remaining,
      creditLimit: limit,
      usagePercent: snapshot?.usage_percent ?? 0,
      // Compatibility for existing meters: these fields now represent shared credits.
      dailyImagesUsed: snapshot?.used ?? 0,
      remainingImages: isUnlimited ? Infinity : Math.floor(remaining / unitCost),
      limit,
      canGenerateImage: !!user && !isAnonymous && (selectedModel !== 'gemini-3.1-flash-lite-image' || snapshot?.liteAvailable === true) && (isUnlimited || remaining >= unitCost * count),
      resetAt: snapshot?.resetAt ?? null,
      refreshQuota,
      FREE_DAILY_IMAGE_LIMIT: FREE_DAILY_IMAGE_CREDITS,
    };
  }, [aspect, claimRefill, count, hasBoost, mode, isAdmin, isAnonymous, loading, quota, refreshQuota, selectedModel, user]);

  return <ImageQuotaContext.Provider value={value}>{children}</ImageQuotaContext.Provider>;
}

export function useImageQuota() {
  const value = useContext(ImageQuotaContext);
  if (!value) throw new Error("useImageQuota must be used within ImageQuotaProvider");
  return value;
}
