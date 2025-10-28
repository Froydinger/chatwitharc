import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type Theme = "dark" | "light";

export function useTheme() {
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize followSystem from localStorage, defaulting to true
  const [followSystem, setFollowSystem] = useState(() => {
    try {
      const saved = localStorage.getItem("followSystemTheme");
      return saved === null ? true : saved === "true";
    } catch (e) {
      console.warn("Failed to read followSystemTheme from localStorage, defaulting to true.", e);
      return true;
    }
  });

  // Initialize theme. This logic runs once on mount.
  const [theme, setThemeState] = useState<Theme>(() => {
    let initialTheme: Theme = "light";
    try {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "dark" || savedTheme === "light") {
        initialTheme = savedTheme;
      }

      // If following system, override with system preference
      const savedFollowSystem = localStorage.getItem("followSystemTheme");
      const shouldFollowSystem = savedFollowSystem === null ? true : savedFollowSystem === "true";

      if (shouldFollowSystem && window.matchMedia) {
        initialTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } else if (savedTheme === null && window.matchMedia) {
        // If no saved theme and not explicitly not following system
        initialTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    } catch (e) {
      console.warn("Failed to read theme from localStorage, defaulting to light.", e);
    }
    return initialTheme;
  });

  // Callback to set theme and also manage localStorage and potentially Supabase
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      // Only set in localStorage if NOT following system.
      // If following system, the theme is derived, not persistent in localStorage.
      const shouldFollowSystem = localStorage.getItem("followSystemTheme") === "true";
      if (!shouldFollowSystem) {
        localStorage.setItem("theme", newTheme);
      } else {
        localStorage.removeItem("theme"); // Clean up if we switch from manual to system
      }
    } catch (e) {
      console.error("Failed to save theme to localStorage:", e);
    }
  }, []);

  // Effect to apply the theme class to the documentElement
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);

  // Load theme from profile on mount for authenticated users
  useEffect(() => {
    if (!user || isLoaded) return;

    const loadUserTheme = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("theme_preference")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (data?.theme_preference) {
          if (data.theme_preference === "system") {
            setFollowSystem(true); // This will trigger the system theme logic
          } else {
            setFollowSystem(false);
            setTheme(data.theme_preference as Theme);
          }
        }
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load user theme from Supabase:", err);
        setIsLoaded(true); // Still mark as loaded to prevent re-attempts
      }
    };

    loadUserTheme();
  }, [user, isLoaded, setTheme]);

  // Effect to listen for system theme changes
  useEffect(() => {
    if (!followSystem || !window.matchMedia) {
      // If not following system or media queries not supported, do nothing
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "dark" : "light"); // Directly set state, don't trigger full `setTheme` callback to avoid localStorage write
    };

    mediaQuery.addEventListener("change", handleChange);

    // Ensure current theme matches system preference immediately
    setThemeState(mediaQuery.matches ? "dark" : "light");

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [followSystem]); // Re-run if followSystem or window.matchMedia changes

  // Handler to toggle between dark/light theme
  const toggleTheme = async () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setFollowSystem(false); // Manually setting theme means we stop following system
    setTheme(newTheme); // This will update localStorage for the new manual theme

    if (user) {
      try {
        await supabase.from("profiles").update({ theme_preference: newTheme }).eq("user_id", user.id);
      } catch (err) {
        console.error("Failed to save theme to profile:", err);
      }
    }
  };

  // Handler to toggle following the system's theme preference
  const toggleFollowSystem = async (enabled: boolean) => {
    setFollowSystem(enabled);

    try {
      localStorage.setItem("followSystemTheme", enabled.toString());
      if (enabled) {
        localStorage.removeItem("theme"); // Clear manual theme when following system
      }
    } catch (e) {
      console.error("Failed to save followSystemTheme to localStorage:", e);
    }

    if (enabled && window.matchMedia) {
      // Immediately apply system theme if enabled
      setThemeState(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else if (!enabled) {
      // If stopping system follow, default to 'dark' or 'light' but ensure 'theme' state is valid
      // This is a crucial line – if stopping 'followSystem', we need a new explicit theme.
      // We could use the current 'theme' state, or default to a safe value.
      // For now, let's keep the current theme state.
      // E.g., if system was dark and we unfollow, stay dark.
      // If no saved theme, maybe default to 'dark'.
      const storedTheme = localStorage.getItem("theme");
      if (storedTheme === "dark" || storedTheme === "light") {
        setThemeState(storedTheme);
      } else {
        setThemeState(theme === "dark" ? "dark" : "light"); // Maintain current theme state or default
      }
    }

    if (user) {
      try {
        await supabase
          .from("profiles")
          .update({ theme_preference: enabled ? "system" : theme }) // Use current `theme` for manual override
          .eq("user_id", user.id);
      } catch (err) {
        console.error("Failed to save theme preference to profile:", err);
      }
    }
  };

  return { theme, toggleTheme, followSystem, toggleFollowSystem };
}
