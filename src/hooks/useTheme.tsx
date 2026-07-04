import { useEffect, useState } from "react";
import { useAccentStore, type ThemeMode } from "@/store/useAccentStore";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function useTheme() {
  const themeMode = useAccentStore((s) => s.themeMode);
  const setThemeMode = useAccentStore((s) => s.setThemeMode);
  const { user, isAnonymous, loading } = useAuth();
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    if (loading) return;

    if (!user || isAnonymous) {
      setLoadedUserId(null);
      const saved = localStorage.getItem("themeMode");
      if (saved && isThemeMode(saved)) {
        setThemeMode(saved);
      } else {
        setThemeMode("dark");
      }
      return;
    }
    if (loadedUserId === user.id) return;

    let cancelled = false;
    void supabase
      .from("profiles")
      .select("theme_preference")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(async ({ data, error }) => {
        if (cancelled) return;
        const nextMode = !error && isThemeMode(data?.theme_preference)
          ? data.theme_preference
          : "system";
        setThemeMode(nextMode);
        setLoadedUserId(user.id);
        if (!error && data?.theme_preference !== nextMode) {
          await supabase.from("profiles").update({ theme_preference: nextMode }).eq("user_id", user.id);
        }
      });

    return () => { cancelled = true; };
  }, [user, loadedUserId, setThemeMode, loading, isAnonymous]);

  useEffect(() => {
    if (loading || !user || loadedUserId !== user.id) return;
    void supabase.from("profiles").update({ theme_preference: themeMode }).eq("user_id", user.id);
  }, [themeMode, user, loadedUserId, loading]);

  useEffect(() => {
    const root = document.documentElement;

    const apply = (isLight: boolean) => {
      // Shared chat, pricing, and upgrade pages always render in dark theme
      const path = location.pathname;
      if (path.startsWith("/share/") || path === "/pricing" || path === "/upgrade") {
        root.classList.remove("light");
        root.classList.add("dark");
        return;
      }
      // Disable transitions during theme swap for instant switching
      root.classList.add("theme-switching");
      if (isLight) {
        root.classList.remove("dark");
        root.classList.add("light");
      } else {
        root.classList.remove("light");
        root.classList.add("dark");
      }
      // Force a reflow then re-enable transitions on next frame
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      root.offsetHeight;
      requestAnimationFrame(() => {
        root.classList.remove("theme-switching");
      });
    };

    if (themeMode === "system") {
      if (typeof window.matchMedia !== "function") {
        apply(false);
        return;
      }
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    apply(themeMode === "light");
  }, [themeMode, location.pathname]);
}
