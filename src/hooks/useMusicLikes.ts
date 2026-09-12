import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

const LOCAL_LIKES_KEY = "arc-music-liked-tracks";

function readLocalLikes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_LIKES_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writeLocalLikes(trackIds: string[]) {
  try {
    localStorage.setItem(LOCAL_LIKES_KEY, JSON.stringify(trackIds));
  } catch {
    // Local likes are only a preview/offline fallback. Account likes use Supabase.
  }
}

export function useMusicLikes() {
  const { user, isAnonymous, loading: authLoading } = useAuth();
  const accountId = user && !isAnonymous ? user.id : null;
  const [likedTrackIds, setLikedTrackIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    if (authLoading) return;

    if (!accountId || !isSupabaseConfigured) {
      setLikedTrackIds(readLocalLikes());
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    void supabase
      .from("music_likes")
      .select("track_id")
      .eq("user_id", accountId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Music likes could not be loaded:", error);
          setLikedTrackIds([]);
        } else {
          setLikedTrackIds((data || []).map((row) => row.track_id));
        }
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, authLoading]);

  const toggleLike = useCallback(async (trackId: string) => {
    const wasLiked = likedTrackIds.includes(trackId);
    const next = wasLiked
      ? likedTrackIds.filter((id) => id !== trackId)
      : [...likedTrackIds, trackId];
    setLikedTrackIds(next);

    if (!accountId || !isSupabaseConfigured) {
      writeLocalLikes(next);
      return;
    }

    const result = wasLiked
      ? await supabase.from("music_likes").delete().eq("user_id", accountId).eq("track_id", trackId)
      : await supabase.from("music_likes").insert({ user_id: accountId, track_id: trackId });

    if (result.error) {
      console.error("Music like could not be saved:", result.error);
      setLikedTrackIds(likedTrackIds);
    }
  }, [accountId, likedTrackIds]);

  return {
    likedTrackIds: useMemo(() => new Set(likedTrackIds), [likedTrackIds]),
    isLoading,
    toggleLike,
  };
}
