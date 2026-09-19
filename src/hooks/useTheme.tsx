import { useEffect } from "react";
import { useAccentStore, type ThemeMode } from "@/store/useAccentStore";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useLocation } from "react-router-dom";
import { useIDEStore } from "@/store/useIDEStore";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function syncIOSStatusBar(isLight: boolean) {
  const meta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  const content = isLight ? "default" : "black";
  if (meta && meta.getAttribute("content") !== content) meta.setAttribute("content", content);
}

export function useTheme() {
  const themeMode = useAccentStore((s) => s.themeMode);
  const setThemeMode = useAccentStore((s) => s.setThemeMode);
  const isIDEOpen = useIDEStore((s) => s.isOpen);
  const { user, isAnonymous, loading } = useAuth();
  const userId = !isAnonymous ? user?.id : undefined;
  const location = useLocation();
  const forceDark = location.pathname.startsWith("/share/")
    || location.pathname === "/pricing" || location.pathname === "/upgrade" || isIDEOpen;

  useEffect(() => {
    if (loading || !userId) return;
    let cancelled = false;
    let applyingRemote = false;
    let revision = 0;
    let syncing = false;
    const pendingKey = `arc-theme-pending:${userId}`;
    let pending: ThemeMode | null = null;
    try {
      const saved = localStorage.getItem(pendingKey);
      if (isThemeMode(saved)) pending = saved;
    } catch { /* Storage may be unavailable in private browsing. */ }
    if (pending) setThemeMode(pending);

    const sync = async () => {
      if (syncing || cancelled) return;
      syncing = true;
      const startRevision = revision;
      try {
        // Serialize rapid theme changes; never let an older write finish last.
        while (pending && !cancelled) {
          const saving = pending;
          const { data, error } = await supabase.from("profiles")
            .update({ theme_preference: saving }).eq("user_id", userId)
            .select("user_id").maybeSingle();
          if (error || !data || cancelled) return;
          if (pending === saving) {
            pending = null;
            try { localStorage.removeItem(pendingKey); } catch { /* optional cache */ }
          }
        }
        const startedRevision = revision;
        const { data, error } = await supabase.from("profiles")
          .select("theme_preference").eq("user_id", userId).maybeSingle();
        if (cancelled || error || pending || revision !== startedRevision) return;
        // A failed/missing profile read must never reset a device's selection.
        if (isThemeMode(data?.theme_preference)) {
          applyingRemote = true;
          setThemeMode(data.theme_preference);
          applyingRemote = false;
        }
      } catch { /* Keep the choice pending for reconnect/reopen. */ }
      finally {
        syncing = false;
        if (!cancelled && pending && revision !== startRevision) void sync();
      }
    };
    const unsubscribe = useAccentStore.subscribe((state, previous) => {
      if (applyingRemote || state.themeMode === previous.themeMode) return;
      revision++;
      pending = state.themeMode;
      try { localStorage.setItem(pendingKey, pending); } catch { /* optional cache */ }
      void sync();
    });
    const refresh = () => { void sync(); };
    const visible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    const retry = window.setInterval(() => { if (pending) refresh(); }, 30000);
    refresh();
    return () => {
      cancelled = true;
      unsubscribe();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
      window.clearInterval(retry);
    };
  }, [userId, loading, setThemeMode]);

  useEffect(() => {
    const root = document.documentElement;

    const apply = (isLight: boolean) => {
      isLight = !forceDark && isLight;
      syncIOSStatusBar(isLight);
      // Ordinary navigation must not reset every animation and synchronously
      // lay out the entire page when its effective theme has not changed.
      if (root.classList.contains(isLight ? "light" : "dark")
        && !root.classList.contains(isLight ? "dark" : "light")) return;
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
  }, [themeMode, forceDark]);
}
