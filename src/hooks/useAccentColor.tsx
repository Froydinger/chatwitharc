import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useAccentStore, type AccentColor } from "@/store/useAccentStore";

export type { AccentColor } from "@/store/useAccentStore";

const accentColorConfigs = {
  red: {
    primary: "0 85% 60%",
    primaryGlow: "0 85% 70%",
    aiMessageBg: "0 15% 16%",
    aiMessageBorder: "0 20% 24%",
    userMessageBg: "0 85% 60%",
    userMessageBorder: "0 85% 60%",
    lightAiMessageBg: "0 20% 97%",
    lightAiMessageBorder: "0 15% 92%",
    lightPrimary: "0 90% 55%",
    lightPrimaryGlow: "0 90% 65%",
  },
  blue: {
    primary: "200 95% 55%",
    primaryGlow: "200 90% 65%",
    aiMessageBg: "200 15% 16%",
    aiMessageBorder: "200 20% 24%",
    userMessageBg: "200 95% 55%",
    userMessageBorder: "200 95% 55%",
    lightAiMessageBg: "200 20% 97%",
    lightAiMessageBorder: "200 15% 92%",
    lightPrimary: "200 95% 50%",
    lightPrimaryGlow: "200 90% 60%",
  },
  green: {
    primary: "142 76% 42%",
    primaryGlow: "142 76% 52%",
    aiMessageBg: "142 15% 16%",
    aiMessageBorder: "142 20% 24%",
    userMessageBg: "142 76% 42%",
    userMessageBorder: "142 76% 42%",
    lightAiMessageBg: "142 20% 97%",
    lightAiMessageBorder: "142 15% 92%",
    lightPrimary: "142 76% 45%",
    lightPrimaryGlow: "142 76% 55%",
  },
  yellow: {
    primary: "48 95% 60%",
    primaryGlow: "48 95% 70%",
    aiMessageBg: "48 15% 16%",
    aiMessageBorder: "48 20% 24%",
    userMessageBg: "48 95% 60%",
    userMessageBorder: "48 95% 60%",
    lightAiMessageBg: "48 20% 97%",
    lightAiMessageBorder: "48 15% 92%",
    lightPrimary: "48 95% 55%",
    lightPrimaryGlow: "48 95% 65%",
  },
  purple: {
    primary: "270 75% 60%",
    primaryGlow: "270 75% 70%",
    aiMessageBg: "270 15% 16%",
    aiMessageBorder: "270 20% 24%",
    userMessageBg: "270 75% 60%",
    userMessageBorder: "270 75% 60%",
    lightAiMessageBg: "270 20% 97%",
    lightAiMessageBorder: "270 15% 92%",
    lightPrimary: "270 75% 55%",
    lightPrimaryGlow: "270 75% 65%",
  },
  orange: {
    primary: "25 95% 58%",
    primaryGlow: "25 95% 68%",
    aiMessageBg: "25 15% 16%",
    aiMessageBorder: "25 20% 24%",
    userMessageBg: "25 95% 58%",
    userMessageBorder: "25 95% 58%",
    lightAiMessageBg: "25 20% 97%",
    lightAiMessageBorder: "25 15% 92%",
    lightPrimary: "25 95% 55%",
    lightPrimaryGlow: "25 95% 65%",
  },
  noir: {
    primary: "0 0% 92%",
    primaryGlow: "0 0% 75%",
    aiMessageBg: "0 0% 12%",
    aiMessageBorder: "0 0% 20%",
    userMessageBg: "0 0% 35%",
    userMessageBorder: "0 0% 45%",
    lightAiMessageBg: "0 0% 97%",
    lightAiMessageBorder: "0 0% 90%",
    lightPrimary: "0 0% 15%",
    lightPrimaryGlow: "0 0% 25%",
  },
};

export function useAccentColor() {
  const { user } = useAuth();
  const accentColor = useAccentStore((s) => s.accentColor);
  const setAccentColorLocal = useAccentStore((s) => s.setAccentColorLocal);
  const [isLoaded, setIsLoaded] = useState(false);


  // Load accent color from profile on mount
  useEffect(() => {
    if (!user || isLoaded || !supabase || !isSupabaseConfigured) {
      if (!user || !supabase || !isSupabaseConfigured) setIsLoaded(true);
      return;
    }

    const loadAccentColor = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("accent_color")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!error && data?.accent_color) {
          // Update local shared state (no DB write-back)
          setAccentColorLocal(data.accent_color as AccentColor);
        }
        setIsLoaded(true);
      } catch (err) {
        console.error("Failed to load accent color:", err);
        setIsLoaded(true);
      }
    };

    loadAccentColor();
  }, [user, isLoaded]);

  // Apply CSS variables whenever accent color changes OR theme changes
  useEffect(() => {
    const applyAccentColors = () => {
      // Fallback to blue if accent color is invalid
      const validAccentColor = accentColorConfigs[accentColor] ? accentColor : "blue";
      const config = accentColorConfigs[validAccentColor];
      const root = document.documentElement;
      const isLight = root.classList.contains("light");
      const isNoir = validAccentColor === "noir";

      // Set data attribute for CSS targeting
      root.setAttribute("data-accent", validAccentColor);

      // Update CSS variables for dark mode
      root.style.setProperty("--primary", config.primary);
      root.style.setProperty("--primary-glow", config.primaryGlow);
      root.style.setProperty("--ring", config.primary);
      root.style.setProperty("--ai-message-bg", config.aiMessageBg);
      root.style.setProperty("--ai-message-border", config.aiMessageBorder);
      root.style.setProperty("--user-message-bg", config.userMessageBg);
      root.style.setProperty("--user-message-border", config.userMessageBorder);

      // Noir theme: black text on white buttons for contrast
      if (isNoir) {
        root.style.setProperty("--primary-foreground", "0 0% 5%");
      } else {
        root.style.setProperty("--primary-foreground", "240 10% 98%");
      }

      // Update light mode CSS variables dynamically when in light mode
      if (isLight) {
        root.style.setProperty("--primary", config.lightPrimary);
        root.style.setProperty("--primary-glow", config.lightPrimaryGlow);
        root.style.setProperty("--ring", config.lightPrimary);
        root.style.setProperty("--ai-message-bg", config.lightAiMessageBg);
        root.style.setProperty("--ai-message-border", config.lightAiMessageBorder);
      }

      // Update selection color - noir uses inverted colors
      const style = document.getElementById("accent-selection-style") || document.createElement("style");
      style.id = "accent-selection-style";
      const primaryRgb = hslToRgb(isLight ? config.lightPrimary : config.primary);
      const selectionTextColor = isNoir ? "black" : "white";
      style.textContent = `
      *::selection { background: rgb(${primaryRgb}) !important; color: ${selectionTextColor} !important; }
      *::-moz-selection { background: rgb(${primaryRgb}) !important; color: ${selectionTextColor} !important; }
      input::selection, textarea::selection { background: rgb(${primaryRgb}) !important; color: ${selectionTextColor} !important; }
      input::-moz-selection, textarea::-moz-selection { background: rgb(${primaryRgb}) !important; color: ${selectionTextColor} !important; }
    `;
      if (!style.parentElement) {
        document.head.appendChild(style);
      }

      // Apply logo accent color with mask and glow
      const logoGlow = document.getElementById("logo-glow-style") || document.createElement("style");
      logoGlow.id = "logo-glow-style";
      // Noir theme uses softer silver/white glow
      const logoColor = isLight ? config.lightPrimary : config.primary;
      const glowOpacity = isNoir ? "0.15" : "0.3";
      logoGlow.textContent = `
      .logo-accent-glow {
        position: relative;
        display: inline-block;
      }
      
      .logo-accent-glow img {
        display: block;
        opacity: 0;
        pointer-events: none;
      }
      
      .logo-accent-glow::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: hsl(${logoColor});
        mask: url('/arc-logo-ui.png') center / contain no-repeat;
        -webkit-mask: url('/arc-logo-ui.png') center / contain no-repeat;
        pointer-events: none;
      }
      
      .logo-accent-glow::before {
        content: '';
        position: absolute;
        inset: -6px;
        background: hsl(${logoColor} / ${glowOpacity});
        border-radius: 50%;
        filter: blur(12px);
        animation: logo-breathe 3s ease-in-out infinite;
        pointer-events: none;
        z-index: -1;
      }
      
      .header-logo-glow {
        position: relative;
        display: inline-block;
      }
      
      .header-logo-glow img {
        display: block;
        opacity: 0;
        pointer-events: none;
      }
      
      .header-logo-glow::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: hsl(${logoColor});
        mask: url('/arc-logo-ui.png') center / contain no-repeat;
        -webkit-mask: url('/arc-logo-ui.png') center / contain no-repeat;
        pointer-events: none;
      }
      
      .header-logo-glow::before {
        content: '';
        position: absolute;
        inset: -3px;
        background: hsl(${logoColor} / ${glowOpacity});
        border-radius: 50%;
        filter: blur(8px);
        animation: logo-breathe 3s ease-in-out infinite;
        pointer-events: none;
        z-index: -1;
      }
      
      @keyframes logo-breathe {
        0%, 100% {
          opacity: 0.3;
          transform: scale(1);
        }
        50% {
          opacity: 0.6;
          transform: scale(1.08);
        }
      }
    `;
      if (!logoGlow.parentElement) {
        document.head.appendChild(logoGlow);
      }

      // Save to localStorage
      localStorage.setItem("accentColor", accentColor);
    };

    // Apply immediately
    applyAccentColors();

    // Listen for theme changes (when light/dark class changes on root)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
          applyAccentColors();
        }
      });
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [accentColor]);

  const setAccentColor = async (color: AccentColor) => {
    // Update shared local state immediately (this drives CSS + UI everywhere)
    setAccentColorLocal(color);

    // Save to profile if user is logged in and backend is configured
    if (user && supabase && isSupabaseConfigured) {
      try {
        await supabase.from("profiles").update({ accent_color: color }).eq("user_id", user.id);
      } catch (err) {
        console.error("Failed to save accent color to profile:", err);
      }
    }
  };

  return { accentColor, setAccentColor };
}

// Helper to convert HSL to RGB for selection styles
function hslToRgb(hsl: string): string {
  const [h, s, l] = hsl.split(" ").map((v) => parseFloat(v));
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l / 100 - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return `${Math.round(f(0) * 255)}, ${Math.round(f(8) * 255)}, ${Math.round(f(4) * 255)}`;
}
