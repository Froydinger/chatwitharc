import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type Theme = "dark" | "light";

// Helper to set CSS custom properties
function setCssVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

export function useTheme() {
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);

  // Start with system-follow preference, default to true
  const [followSystem, setFollowSystemState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("followSystemTheme");
      return saved === null ? true : saved === "true";
    } catch (e) {
      console.warn("Failed to read followSystemTheme from localStorage, defaulting to true.", e);
      return true;
    }
  });

  // Load theme from localStorage or system, with a safe default
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const savedTheme = localStorage.getItem("theme");
      const shouldFollowSystem = localStorage.getItem("followSystemTheme") === "true";
      if (shouldFollowSystem) {
        return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
      if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
      }
    } catch (e) {
      console.warn("Failed to read theme from localStorage, defaulting to light.", e);
    }
    return "light";
  });

  // Accent color state, load from localStorage or default to green-ish
  const [accentColor, setAccentColorState] = useState<string>(() => {
    try {
      const savedAccent = localStorage.getItem("accentColor");
      return savedAccent || "142 76.0% 36.3%";
    } catch (e) {
      console.warn("Failed to read accentColor from localStorage, defaulting to green.", e);
      return "142 76.0% 36.3%";
    }
  });

  // Safe setter for theme (persists only when not following system)
  const setTheme = useCallback(
    (newTheme: Theme) => {
      setThemeState(newTheme);
      try {
        const shouldFollowSystem = localStorage.getItem("followSystemTheme") === "true";
        if (!shouldFollowSystem) {
          localStorage.setItem("theme", newTheme);
        } else {
          localStorage.removeItem("theme");
        }
      } catch (e) {
        console.error("Failed to save theme to localStorage:", e);
      }
      // Immediately re-apply theme + accent in DOM
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(newTheme);
      // Re-apply accent in case something overwrote it
      setCssVar("--primary", accentColor);
    },
    [accentColor],
  );

  // Accent color setter that also persists to localStorage
  const setAccentColor = useCallback((newColorHsL: string) => {
    setAccentColorState(newColorHsL);
    try {
      localStorage.setItem("accentColor", newColorHsL);
    } catch (e) {
      console.error("Failed to save accent color to localStorage:", e);
    }
    // Update CSS var immediately
    setCssVar("--primary", newColorHsL);
  }, []);

  // Apply theme + accent on change
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    setCssVar("--primary", accentColor);
  }, [theme, accentColor]);

  // Load user preferences on mount (theme + accent color)
  useEffect(() => {
    if (!user || isLoaded) return;

    const loadUserPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("theme_preference, accent_color_preference")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Failed to load user preferences from Supabase:", error);
          setIsLoaded(true);
          return;
        }

        if (data) {
          const themePref = (data as any).theme_preference as string | undefined;
          const accentPref = (data as any).accent_color_preference as string | undefined;

          if (themePref === "system") {
            setFollowSystemState(true);
            const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
            setThemeState(sysDark ? "dark" : "light");
          } else if (themePref === "dark" || themePref === "light") {
            setFollowSystemState(false);
            setTheme(themePref as Theme);
          }

          if (accentPref) {
            setAccentColor(accentPref);
          }
        }
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load user preferences due to unexpected error:", err);
        setIsLoaded(true);
      }
    };

    loadUserPreferences();
  }, [user, isLoaded, setTheme, setAccentColor]);

  // Listen to system-theme changes when following the system
  useEffect(() => {
    if (!followSystem || !window.matchMedia) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "dark" : "light");
      // No need to touch accentColor here; it's controlled separately
    };

    mq.addEventListener("change", onChange);
    setThemeState(mq.matches ? "dark" : "light");

    return () => mq.removeEventListener("change", onChange);
  }, [followSystem]);

  // Public actions
  const toggleTheme = async () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    // When user toggles manually, stop following system
    setFollowSystemState(false);
    // Apply and persist the new theme
    setTheme(newTheme);

    if (user) {
      try {
        const payload: { theme_preference?: string } = { theme_preference: newTheme };
        await supabase.from("profiles").update(payload).eq("user_id", user.id);
      } catch (err) {
        console.error("Failed to save theme to profile:", err);
      }
    }
  };

  const toggleFollowSystem = async (enabled: boolean) => {
    setFollowSystemState(enabled);

    try {
      localStorage.setItem("followSystemTheme", enabled.toString());
      if (enabled) {
        // If enabling system, ensure we re-derive and apply system theme
        const sysTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        setTheme(sysTheme);
      }
    } catch (e) {
      console.error("Failed to save followSystemTheme to localStorage:", e);
    }

    // If turning off system follow, keep current theme; ensure accent color still applies
    if (user) {
      try {
        const payload: { theme_preference?: string } = { theme_preference: enabled ? "system" : theme };
        await supabase.from("profiles").update(payload).eq("user_id", user.id);
      } catch (err) {
        console.error("Failed to save theme preference to profile:", err);
      }
    }
  };

  // Accent color setter exposed for UI
  const setAppAccentColor = async (colorHsL: string) => {
    setAccentColor(colorHsL);
    try {
      if (user) {
        const payload: { accent_color_preference?: string } = { accent_color_preference: colorHsL };
        await supabase.from("profiles").update(payload).eq("user_id", user.id);
      }
    } catch (err) {
      console.error("Failed to save accent color:", err);
    }
  };

  return { theme, toggleTheme, followSystem, toggleFollowSystem, accentColor, setAppAccentColor };
}
