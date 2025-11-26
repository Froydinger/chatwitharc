import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

type Theme = "dark" | "light";

// Default accent color (blue for consistency)
const DEFAULT_ACCENT = "210 95.0% 50.0%";

// Validate HSL color format (e.g., "142 76.0% 36.3%")
function isValidHslColor(color: string): boolean {
  if (!color || typeof color !== "string") return false;
  // Basic check: should have format "H S% L%" with numbers
  const hslRegex = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/;
  return hslRegex.test(color.trim());
}

// Helper to set CSS custom properties with validation
function setCssVar(name: string, value: string) {
  if (name === "--primary" && !isValidHslColor(value)) {
    console.warn(`Invalid HSL color: "${value}", using default`);
    document.documentElement.style.setProperty(name, DEFAULT_ACCENT);
    // Also set primary-glow for gradients
    document.documentElement.style.setProperty("--primary-glow", DEFAULT_ACCENT);
  } else {
    document.documentElement.style.setProperty(name, value);
    // When setting --primary, also set --primary-glow for gradients
    if (name === "--primary") {
      document.documentElement.style.setProperty("--primary-glow", value);
    }
  }
}

interface ProfileUpdatePayload {
  theme_preference?: string;
  accent_color?: string; // use the existing column
}

export function useTheme() {
  const { user } = useAuth();
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

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
      if (savedAccent && isValidHslColor(savedAccent)) {
        // Apply immediately on initialization
        setCssVar("--primary", savedAccent);
        return savedAccent;
      }
      // Apply default immediately
      setCssVar("--primary", DEFAULT_ACCENT);
      return DEFAULT_ACCENT;
    } catch (e) {
      console.warn("Failed to read accentColor from localStorage, defaulting to green.", e);
      setCssVar("--primary", DEFAULT_ACCENT);
      return DEFAULT_ACCENT;
    }
  });

  // Ensure accent color is applied immediately on mount (before any async operations)
  useEffect(() => {
    setCssVar("--primary", accentColor);
  }, []);

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
    // Validate color format before applying
    if (!isValidHslColor(colorHsL)) {
      console.error("Invalid HSL color format:", colorHsL);
      return;
    }

    setAccentColorState(colorHsL);

    // Immediately apply to DOM
    setCssVar("--primary", colorHsL);

    try {
      // Persist to localStorage
      localStorage.setItem("accentColor", colorHsL);

      // Persist to DB using the existing column
      if (user) {
        await supabase.from("profiles").update({ accent_color: colorHsL }).eq("user_id", user.id);
      }
    } catch (err) {
      console.error("Failed to save accent color:", err);
    }
  };

  // Apply theme class on theme change and re-apply accent color
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    // Force re-apply accent color when theme changes
    setCssVar("--primary", accentColor);
  }, [theme, accentColor]);

  // Apply accent color on every change (critical for consistency)
  useEffect(() => {
    setCssVar("--primary", accentColor);
  }, [accentColor]);

  // Load user preferences (theme + accent) on mount - only loads from DB once
  useEffect(() => {
    if (!user || preferencesLoaded) return;

    const loadUserPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("theme_preference, accent_color")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Failed to load user preferences from Supabase:", error);
          setPreferencesLoaded(true);
          return;
        }

        if (data) {
          const themePref = (data as any).theme_preference as string | undefined;
          const accentPref = (data as any).accent_color as string | undefined;

          // Load accent color FIRST before applying theme
          if (accentPref && isValidHslColor(accentPref)) {
            setAccentColorState(accentPref);
            localStorage.setItem("accentColor", accentPref);
            // CSS var will be applied by the accentColor useEffect
          } else if (accentPref) {
            console.warn("Invalid accent color from database:", accentPref);
          }

          // Then update theme state (useEffect will apply it)
          if (themePref === "system") {
            setFollowSystemState(true);
            localStorage.setItem("followSystemTheme", "true");
            const sysDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
            setThemeState(sysDark ? "dark" : "light");
          } else if (themePref === "dark" || themePref === "light") {
            setFollowSystemState(false);
            localStorage.setItem("followSystemTheme", "false");
            setThemeState(themePref as Theme);
            localStorage.setItem("theme", themePref);
          }
        }
        setPreferencesLoaded(true);
      } catch (err) {
        console.error("Failed to load user preferences due to unexpected error:", err);
        setPreferencesLoaded(true);
      }
    };

    loadUserPreferences();
  }, [user, preferencesLoaded]);

  // React to system theme changes when following system
  useEffect(() => {
    if (!followSystem || !window.matchMedia) return;

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      setThemeState(e.matches ? "dark" : "light");
    };

    mq.addEventListener("change", onChange);

    // Apply system theme on mount if following system
    const sysTheme = mq.matches ? "dark" : "light";
    setThemeState(sysTheme);

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
        setThemeState(sysTheme);
        localStorage.removeItem("theme");
      } else {
        localStorage.setItem("theme", theme);
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
