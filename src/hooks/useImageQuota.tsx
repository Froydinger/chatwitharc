import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const DAILY_IMAGE_OUTPUT_LIMIT = 20;

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

  const refreshQuota = useCallback(async () => {
    if (!user || isAnonymous) {
      setQuota(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_my_image_quota");
      if (error) throw error;
      setQuota(data as unknown as ImageQuotaSnapshot);
    } catch (error) {
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
    const isAdmin = quota?.isAdmin === true;
    const remaining = isAdmin ? Infinity : quota?.remaining ?? DAILY_IMAGE_OUTPUT_LIMIT;
    return {
      loading,
      isAdmin,
      dailyImagesUsed: quota?.used ?? 0,
      remainingImages: remaining,
      canGenerateImage: !isAnonymous && (isAdmin || remaining > 0),
      resetAt: quota?.resetAt ?? null,
      refreshQuota,
      FREE_DAILY_IMAGE_LIMIT: DAILY_IMAGE_OUTPUT_LIMIT,
    };
  }, [isAnonymous, loading, quota, refreshQuota]);

  return <ImageQuotaContext.Provider value={value}>{children}</ImageQuotaContext.Provider>;
}

export function useImageQuota() {
  const value = useContext(ImageQuotaContext);
  if (!value) throw new Error("useImageQuota must be used within ImageQuotaProvider");
  return value;
}
