import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type Theme = "dark" | "light";

// Helper to set CSS custom properties
function setCssVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

// Profile update payload (kept lightweight for safety)
interface ProfileUpdatePayload {
  theme_preference?: string;
  accent_color_preference?: string;
}

export function useTheme() {
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false); // Tracks if user preferences from DB are loaded

  // 1) Initialize followSystem directly from localStorage, default to true
  const [followSystem, setFollowSystemState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("followSystemTheme");
      return saved === null ? true : saved === "true";
    } catch (e) {
      console.warn("Failed to read followSystemTheme from localStorage, defaulting to true.", e);
      return true;
    }
  });

  // 2) Initialize theme directly from localStorage, falling back to system preference
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

  // 3) Initialize accentColor directly from localStorage, default to green
  const [accentColor, setAccentColorState] = useState<string>(() => {
    try {
      const savedAccent = localStorage.getItem("accentColor");
      return savedAccent || "142 76.0% 36.3%";
    } catch (e) {
      console.warn("Failed to read accentColor from localStorage, defaulting to green.", e);
      return "142 76.0% 36.3%";
    }
  });

  // Helpers to update theme/accent color
  const setTheme = useCallback((newTheme: Theme) => {
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
  }, []);

  const setAccentColor = useCallback((newColorHsL: string) => {
    setAccentColorState(newColorHsL);
    try {
      localStorage.setItem("accentColor", newColorHsL);
    } catch (e) {
      console.error("Failed to save accent color to localStorage:", e);
    }
  }, []);

  // 4) Apply theme and accent color to DOM immediately on changes
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    setCssVar("--primary", accentColor);
  }, [theme, accentColor]);

  // 5) Load user preferences from Supabase on first mount if user is present
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
          // Access with a safe pattern (data type may not be generated yet)
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

  // 6) Listen for system theme changes when following system
  useEffect(() => {
    if (!followSystem || !window.matchMedia) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "dark" : "light");
    };

    mq.addEventListener("change", onChange);
    // Set initial to system
    setThemeState(mq.matches ? "dark" : "light");

    return () => mq.removeEventListener("change", onChange);
  }, [followSystem]);

  // 7) Actions
  const toggleTheme = async () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setFollowSystemState(false);
    setTheme(newTheme);
    if (user) {
      try {
        const payload: ProfileUpdatePayload = { theme_preference: newTheme };
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
    } catch (e) {
      console.error("Failed to save followSystemTheme to localStorage:", e);
    }

    if (enabled && window.matchMedia) {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else {
      const storedTheme = localStorage.getItem("theme");
      if (storedTheme === "dark" || storedTheme === "light") {
        setTheme(storedTheme);
      }
    }

    if (user) {
      try {
        const payload: ProfileUpdatePayload = { theme_preference: enabled ? "system" : theme };
        await supabase.from("profiles").update(payload).eq("user_id", user.id);
      } catch (err) {
        console.error("Failed to save theme preference to profile:", err);
      }
    }
  };

  // 8) Accent color setter exposed for UI (e.g., settings panel)
  const setAppAccentColor = async (colorHsL: string) => {
    setAccentColor(colorHsL);
    try {
      if (user) {
        const payload: ProfileUpdatePayload = { accent_color_preference: colorHsL };
        await supabase.from("profiles").update(payload).eq("user_id", user.id);
      }
    } catch (err) {
      console.error("Failed to save accent color:", err);
    }
  };

  return {
    theme,
    toggleTheme,
    followSystem,
    toggleFollowSystem,
    accentColor,
    setAppAccentColor,
  };
}
