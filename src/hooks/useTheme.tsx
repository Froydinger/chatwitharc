import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type Theme = "dark" | "light";

// Helper to set CSS custom properties
function setCssVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

// Define a type for the profile update payload (still useful for clarity)
interface ProfileUpdatePayload {
  theme_preference?: string; // Union type 'system' | 'dark' | 'light'
  accent_color_preference?: string; // Store HSL string
}

export function useTheme() {
  const { user } = useAuth();
  const [isLoaded, setIsLoaded] = useState(false); // Tracks if user preferences from DB are loaded

  // 1. Initialize followSystem directly from localStorage, default to true
  const [followSystem, setFollowSystemState] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("followSystemTheme");
      return saved === null ? true : saved === "true";
    } catch (e) {
      console.warn("Failed to read followSystemTheme from localStorage, defaulting to true.", e);
      return true;
    }
  });

  // 2. Initialize theme directly from localStorage, falling back to system preference
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      const savedTheme = localStorage.getItem("theme");
      const savedFollowSystem = localStorage.getItem("followSystemTheme");
      const shouldFollowSystem = savedFollowSystem === null ? true : savedFollowSystem === "true";

      if (shouldFollowSystem) {
        return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } else if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
      }
    } catch (e) {
      console.warn("Failed to read theme from localStorage, defaulting to light.", e);
    }
    return "light"; // Default if anything fails
  });

  // 3. Initialize accentColor directly from localStorage, falling back to default green
  const [accentColor, setAccentColorState] = useState<string>(() => {
    try {
      const savedAccent = localStorage.getItem("accentColor");
      return savedAccent || "142 76.0% 36.3%"; // Default HSL for a nice green
    } catch (e) {
      console.warn("Failed to read accentColor from localStorage, defaulting to green.", e);
      return "142 76.0% 36.3%";
    }
  });

  // Unified function to set theme, updates state and localStorage
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      const shouldFollowSystem = localStorage.getItem("followSystemTheme") === "true";
      if (!shouldFollowSystem) {
        localStorage.setItem("theme", newTheme);
      } else {
        localStorage.removeItem("theme"); // Clear explicit theme if following system
      }
    } catch (e) {
      console.error("Failed to save theme to localStorage:", e);
    }
  }, []);

  // Unified function to set accent color, updates state and localStorage
  const setAccentColor = useCallback((newColorHsL: string) => {
    setAccentColorState(newColorHsL);
    try {
      localStorage.setItem("accentColor", newColorHsL);
    } catch (e) {
      console.error("Failed to save accent color to localStorage:", e);
    }
  }, []);

  // --- IMPORTANT: Apply theme and accent color to DOM immediately on component mount, and whenever they change ---
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    setCssVar("--primary", accentColor);
    // Potentially other primary-related CSS vars here if needed:
    // setCssVar('--primary-foreground', `var(--${theme === 'dark' ? 'neutral-50' : 'neutral-900'})`);
  }, [theme, accentColor]); // Re-run whenever theme or accentColor changes

  // --- Load user preferences from Supabase (only if user is logged in) ---
  useEffect(() => {
    if (!user || isLoaded) return; // Only run once per user session

    const loadUserPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("theme_preference, accent_color_preference")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Failed to load user preferences from Supabase:", error);
          // Handle error gracefully, maybe fall back to local storage
          return;
        }

        if (data) {
          const fetchedThemePref = data.theme_preference;
          const fetchedAccentColorPref = data.accent_color_preference;

          // Apply fetched theme preference
          if (fetchedThemePref === "system") {
            setFollowSystemState(true); // This will trigger system theme logic
            setTheme(window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
          } else if (fetchedThemePref === "dark" || fetchedThemePref === "light") {
            setFollowSystemState(false);
            setTheme(fetchedThemePref);
          }

          // Apply fetched accent color preference
          if (fetchedAccentColorPref) {
            setAccentColor(fetchedAccentColorPref);
          }
        }
        setIsLoaded(true); // Mark as loaded to prevent re-fetching
      } catch (err) {
        console.error("Failed to load user preferences due to unexpected error:", err);
        setIsLoaded(true);
      }
    };

    loadUserPreferences();
  }, [user, isLoaded, setTheme, setAccentColor]); // Depend on user, isLoaded, and setters

  // --- Listen for system theme changes (if followSystem is true) ---
  useEffect(() => {
    if (!followSystem || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "dark" : "light"); // Directly update theme state
    };

    mediaQuery.addEventListener("change", handleChange);

    // Set initial theme state based on system preference
    setThemeState(mediaQuery.matches ? "dark" : "light");

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [followSystem]); // Re-run if followSystem changes

  // --- Action handlers for controls ---

  const toggleTheme = async () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setFollowSystemState(false); // Manually setting theme means we stop following system
    setTheme(newTheme); // Calls the useCallback version to update localStorage

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
    } else if (!enabled) {
      // If stopping system follow, retrieve last manually set theme or default
      const storedTheme = localStorage.getItem("theme");
      setTheme(storedTheme === "dark" || storedTheme === "light" ? storedTheme : "dark"); // Default to dark if no stored manual theme
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

  const setProfileAccentColor = async (colorHsL: string) => {
    setAccentColor(colorHsL); // Updates state and localStorage
    if (user) {
      try {
        const payload: ProfileUpdatePayload = { accent_color_preference: colorHsL };
        await supabase.from("profiles").update(payload).eq("user_id", user.id);
      } catch (err) {
        console.error("Failed to save accent color to profile:", err);
      }
    }
  };

  return {
    theme,
    toggleTheme,
    followSystem,
    toggleFollowSystem,
    accentColor,
    setAppAccentColor: setProfileAccentColor, // Renamed for clarity on usage
  };
}
