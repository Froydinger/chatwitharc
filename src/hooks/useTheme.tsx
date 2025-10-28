import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type Theme = "dark" | "light";

// Helper to set CSS custom properties
function setCssVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value);
}

// Define a type for the profile update payload, to include accent_color_preference
// This will resolve the TS errors assuming the column now exists in your DB.
// You can remove this type and rely on generated types after running `supabase gen types`.
interface ProfileUpdatePayload {
  theme_preference?: string; // Union type 'system' | 'dark' | 'light'
  accent_color_preference?: string; // Store HSL string
  // Add any other updatable profile properties here
}

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

      const savedFollowSystem = localStorage.getItem("followSystemTheme");
      const shouldFollowSystem = savedFollowSystem === null ? true : savedFollowSystem === "true";

      if (shouldFollowSystem && window.matchMedia) {
        initialTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } else if (savedTheme === null && window.matchMedia) {
        initialTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      }
    } catch (e) {
      console.warn("Failed to read theme from localStorage, defaulting to light.", e);
    }
    return initialTheme;
  });

  // New state for accent color, default to a sensible fallback (e.g., green-500 equivalent in HSL)
  const [accentColor, setAccentColor] = useState<string>(() => {
    try {
      const savedAccent = localStorage.getItem("accentColor");
      return savedAccent || "142 76.0% 36.3%"; // Default HSL for a nice green
    } catch (e) {
      console.warn("Failed to read accentColor from localStorage, defaulting to green.", e);
      return "142 76.0% 36.3%";
    }
  });

  // Callback to set theme and also manage localStorage
  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
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

  // Effect to apply the theme class AND accent color to the documentElement
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);

    // Apply accent color as a CSS variable
    // This allows you to use 'hsl(var(--primary))' in your Tailwind config or CSS
    setCssVar("--primary", accentColor);
    // You might also want to set --primary-foreground here if it's derived from primary
    // For example: setCssVar('--primary-foreground', `var(--${theme === 'dark' ? 'neutral-50' : 'neutral-900'})`);
    // Or if primary-foreground is custom per accent color:
    // setCssVar('--primary-foreground', getContrastColor(accentColor)); // You'd need a helper for this
  }, [theme, accentColor]);

  // Load theme and accent color from profile on mount for authenticated users
  useEffect(() => {
    if (!user || isLoaded) return;

    const loadUserPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          // Using a narrower type for the select output might be necessary if types are not updated
          .select("theme_preference, accent_color_preference")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          // Explicitly extracting properties for clearer type handling
          const themePreference = (data as any).theme_preference as string | undefined;
          const accentColorPreference = (data as any).accent_color_preference as string | undefined;

          // Handle theme preference
          if (themePreference === "system") {
            setFollowSystem(true);
          } else if (themePreference) {
            setFollowSystem(false);
            setTheme(themePreference as Theme);
          }

          // Handle accent color preference
          if (accentColorPreference) {
            setAccentColor(accentColorPreference);
            localStorage.setItem("accentColor", accentColorPreference);
          }
        }
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load user preferences from Supabase:", err);
        setIsLoaded(true);
      }
    };

    loadUserPreferences();
  }, [user, isLoaded, setTheme]);

  // Effect to listen for system theme changes
  useEffect(() => {
    if (!followSystem || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);

    setThemeState(mediaQuery.matches ? "dark" : "light");

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [followSystem]);

  // Handler to toggle between dark/light theme
  const toggleTheme = async () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setFollowSystem(false);
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

  // Handler to toggle following the system's theme preference
  const toggleFollowSystem = async (enabled: boolean) => {
    setFollowSystem(enabled);

    try {
      localStorage.setItem("followSystemTheme", enabled.toString());
      if (enabled) {
        localStorage.removeItem("theme");
      }
    } catch (e) {
      console.error("Failed to save followSystemTheme to localStorage:", e);
    }

    if (enabled && window.matchMedia) {
      setThemeState(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    } else if (!enabled) {
      const storedTheme = localStorage.getItem("theme");
      if (storedTheme === "dark" || storedTheme === "light") {
        setThemeState(storedTheme);
      } else {
        setThemeState(theme === "dark" ? "dark" : "light");
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

  // New function to update accent color
  const setAppAccentColor = async (colorHsL: string) => {
    setAccentColor(colorHsL);
    try {
      localStorage.setItem("accentColor", colorHsL);
      if (user) {
        const payload: ProfileUpdatePayload = { accent_color_preference: colorHsL };
        await supabase.from("profiles").update(payload).eq("user_id", user.id);
      }
    } catch (err) {
      console.error("Failed to save accent color:", err);
    }
  };

  return { theme, toggleTheme, followSystem, toggleFollowSystem, accentColor, setAppAccentColor };
}
