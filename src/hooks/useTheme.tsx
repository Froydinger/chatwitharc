import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

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

export function useTheme() {
  const { user } = useAuth();
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  // Dark mode only - always set to dark
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Accent color state (default to blue)
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
      console.warn("Failed to read accentColor from localStorage, defaulting to blue.", e);
      setCssVar("--primary", DEFAULT_ACCENT);
      return DEFAULT_ACCENT;
    }
  });

  // Reset preferencesLoaded flag when user changes (login/logout)
  useEffect(() => {
    setPreferencesLoaded(false);
  }, [user?.id]);

  // Ensure accent color is applied immediately on mount (before any async operations)
  useEffect(() => {
    setCssVar("--primary", accentColor);
  }, []);

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
      if (user && supabase && isSupabaseConfigured) {
        await supabase.from("profiles").update({ accent_color: colorHsL }).eq("user_id", user.id);
      }
    } catch (err) {
      console.error("Failed to save accent color:", err);
    }
  };

  // Apply accent color on every change (critical for consistency)
  useEffect(() => {
    setCssVar("--primary", accentColor);
  }, [accentColor]);

  // Load user preferences immediately on login
  useEffect(() => {
    if (!user || preferencesLoaded || !supabase || !isSupabaseConfigured) {
      if (!user || !supabase || !isSupabaseConfigured) setPreferencesLoaded(true);
      return;
    }

    const loadUserPreferences = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("accent_color")
          .eq("user_id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Failed to load user preferences from Supabase:", error);
          setPreferencesLoaded(true);
          return;
        }

        if (data) {
          const accentPref = (data as any).accent_color as string | undefined;

          // Load accent color - apply immediately
          if (accentPref && isValidHslColor(accentPref)) {
            setAccentColorState(accentPref);
            localStorage.setItem("accentColor", accentPref);
            // Immediately apply to DOM for instant theme loading
            setCssVar("--primary", accentPref);
          } else if (accentPref) {
            console.warn("Invalid accent color from database:", accentPref);
          }
        }
        setPreferencesLoaded(true);
      } catch (err) {
        console.error("Failed to load user preferences due to unexpected error:", err);
        setPreferencesLoaded(true);
      }
    };

    // Load immediately without any delay
    loadUserPreferences();
  }, [user, preferencesLoaded]);

  return { accentColor, setAppAccentColor };
}
