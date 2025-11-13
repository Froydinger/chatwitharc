import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type Theme = "dark" | "light";

// Helper to set CSS custom properties
function setCssVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

interface ProfileUpdatePayload {
  theme_preference?: string;
  accent_color?: string; // use the existing column
}

export function useTheme() {
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);

  // Follow system by default (persisted)
  const [followSystem, setFollowSystemState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("followSystemTheme");
      return saved === null ? true : saved === "true";
    } catch (e) {
      console.warn("Failed to read followSystemTheme from localStorage, defaulting to true.", e);
      return true;
    }
  });

  // Theme initialization: respects followSystem or explicit theme
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

  // Accent color state (default to green-ish)
  const [accentColor, setAccentColorState] = useState<string>(() => {
    try {
      const savedAccent = localStorage.getItem("accentColor");
      return savedAccent || "142 76.0% 36.3%";
    } catch (e) {
      console.warn("Failed to read accentColor from localStorage, defaulting to green.", e);
      return "142 76.0% 36.3%";
    }
  });

  // Save theme (with safe persistence)
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

      // Always re-apply theme + accent to DOM
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(newTheme);
      setCssVar("--primary", accentColor);
    },
    [accentColor],
  );

  // Accent color setter for UI (exposed)
  const setAppAccentColor = async (colorHsL: string) => {
    setAccentColorState(colorHsL);
    try {
      // Persist to DB using the existing column
      if (user) {
        await supabase.from("profiles").update({ accent_color: colorHsL }).eq("user_id", user.id);
      }
      localStorage.setItem("accentColor", colorHsL);
    } catch (err) {
      console.error("Failed to save accent color:", err);
    }
    // Immediately apply
    setCssVar("--primary", colorHsL);
  };

  // Apply theme + accent on any change (skip if already applied by blocking script)
  useEffect(() => {
    const root = document.documentElement;
    const currentTheme = root.classList.contains('dark') ? 'dark' : root.classList.contains('light') ? 'light' : null;
    
    // Only update if theme has actually changed
    if (currentTheme !== theme) {
      root.classList.remove("light", "dark");
      root.classList.add(theme);
    }
    
    // Always ensure accent color is applied
    setCssVar("--primary", accentColor);
    
    // Mark as loaded after first application
    if (!isLoaded) {
      setIsLoaded(true);
    }
  }, [theme, accentColor, isLoaded]);

  // Load user preferences (theme + accent) on mount
  useEffect(() => {
    if (!user || isLoaded) return;

    const loadUserPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("theme_preference, accent_color")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Failed to load user preferences from Supabase:", error);
          setIsLoaded(true);
          return;
        }

        if (data) {
          const themePref = (data as any).theme_preference as string | undefined;
          const accentPref = (data as any).accent_color as string | undefined;

          if (themePref === "system") {
            setFollowSystemState(true);
            const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
            setThemeState(sysDark ? "dark" : "light");
          } else if (themePref === "dark" || themePref === "light") {
            setFollowSystemState(false);
            setTheme(themePref as Theme);
          }

          if (accentPref) {
            setAccentColorState(accentPref);
            localStorage.setItem("accentColor", accentPref);
          }
        }
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load user preferences due to unexpected error:", err);
        setIsLoaded(true);
      }
    };

    loadUserPreferences();
  }, [user, isLoaded, setTheme, setAppAccentColor]);

  // React to system theme changes when following system
  useEffect(() => {
    if (!followSystem || !window.matchMedia) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "dark" : "light");
      // Accent color preserved via CSS var
      // Do not touch accentColor here
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
    setTheme(newTheme);

    if (user) {
      try {
        await supabase.from("profiles").update({ theme_preference: newTheme }).eq("user_id", user.id);
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
        // Re-derive and apply system theme
        const sysTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        setTheme(sysTheme);
      }
    } catch (e) {
      console.error("Failed to save followSystemTheme to localStorage:", e);
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

  // Accent color setter for UI (exposed)
  // (we keep the same function name for compatibility)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const {} = {};

  return { theme, toggleTheme, followSystem, toggleFollowSystem, accentColor, setAppAccentColor };
}
