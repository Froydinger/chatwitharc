import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useAccentStore, type AccentColor } from "@/store/useAccentStore";

export type { AccentColor } from "@/store/useAccentStore";

const accentColorConfigs = {
  red: {
    primary: "0 90% 48%",
    primaryGlow: "0 92% 58%",
    darkBackground: "0 18% 1%",
    aiMessageBg: "0 15% 14%",
    aiMessageBorder: "0 22% 22%",
    userMessageBg: "0 90% 48%",
    userMessageBorder: "0 90% 48%",
    lightAiMessageBg: "0 20% 97%",
    lightAiMessageBorder: "0 15% 92%",
    lightPrimary: "0 92% 48%",
    lightPrimaryGlow: "0 92% 58%",
  },
  blue: {
    primary: "205 100% 48%",
    primaryGlow: "205 95% 58%",
    darkBackground: "210 30% 1%",
    aiMessageBg: "205 18% 14%",
    aiMessageBorder: "205 22% 22%",
    userMessageBg: "205 100% 48%",
    userMessageBorder: "205 100% 48%",
    lightAiMessageBg: "200 20% 97%",
    lightAiMessageBorder: "200 15% 92%",
    lightPrimary: "205 100% 44%",
    lightPrimaryGlow: "205 95% 54%",
  },
  green: {
    primary: "145 82% 35%",
    primaryGlow: "145 80% 45%",
    darkBackground: "145 20% 1%",
    aiMessageBg: "145 18% 14%",
    aiMessageBorder: "145 22% 22%",
    userMessageBg: "145 82% 35%",
    userMessageBorder: "145 82% 35%",
    lightAiMessageBg: "142 20% 97%",
    lightAiMessageBorder: "142 15% 92%",
    lightPrimary: "145 82% 38%",
    lightPrimaryGlow: "145 80% 48%",
  },
  yellow: {
    primary: "45 100% 48%",
    primaryGlow: "45 100% 58%",
    darkBackground: "45 18% 1%",
    aiMessageBg: "45 18% 14%",
    aiMessageBorder: "45 22% 22%",
    userMessageBg: "45 100% 48%",
    userMessageBorder: "45 100% 48%",
    lightAiMessageBg: "48 20% 97%",
    lightAiMessageBorder: "48 15% 92%",
    lightPrimary: "45 100% 45%",
    lightPrimaryGlow: "45 100% 55%",
  },
  purple: {
    primary: "268 85% 52%",
    primaryGlow: "268 82% 62%",
    darkBackground: "268 22% 1%",
    aiMessageBg: "268 18% 14%",
    aiMessageBorder: "268 22% 22%",
    userMessageBg: "268 85% 52%",
    userMessageBorder: "268 85% 52%",
    lightAiMessageBg: "270 20% 97%",
    lightAiMessageBorder: "270 15% 92%",
    lightPrimary: "268 85% 48%",
    lightPrimaryGlow: "268 82% 58%",
  },
  orange: {
    primary: "22 100% 50%",
    primaryGlow: "22 98% 60%",
    darkBackground: "22 22% 1%",
    aiMessageBg: "22 18% 14%",
    aiMessageBorder: "22 22% 22%",
    userMessageBg: "22 100% 50%",
    userMessageBorder: "22 100% 50%",
    lightAiMessageBg: "25 20% 97%",
    lightAiMessageBorder: "25 15% 92%",
    lightPrimary: "22 100% 48%",
    lightPrimaryGlow: "22 98% 58%",
  },
  noir: {
    primary: "0 0% 95%",
    primaryGlow: "0 0% 80%",
    darkBackground: "0 0% 0%",
    aiMessageBg: "0 0% 12%",
    aiMessageBorder: "0 0% 20%",
    userMessageBg: "0 0% 0%",
    userMessageBorder: "0 0% 18%",
    lightAiMessageBg: "0 0% 100%",
    lightAiMessageBorder: "0 0% 8%",
    lightPrimary: "0 0% 0%",
    lightPrimaryGlow: "0 0% 0%",
  },
  gold: {
    primary: "43 82% 52%",
    primaryGlow: "46 92% 64%",
    darkBackground: "42 30% 2%",
    aiMessageBg: "42 22% 14%",
    aiMessageBorder: "43 45% 28%",
    userMessageBg: "43 82% 52%",
    userMessageBorder: "43 82% 52%",
    lightAiMessageBg: "46 40% 96%",
    lightAiMessageBorder: "43 40% 88%",
    lightPrimary: "40 78% 44%",
    lightPrimaryGlow: "43 85% 55%",
  },


};

export function useAccentColor() {
  const { user } = useAuth();
  const accentColor = useAccentStore((s) => s.accentColor);
  const setAccentColorLocal = useAccentStore((s) => s.setAccentColorLocal);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);


  // Load accent color from profile on mount
  useEffect(() => {
    if (!user) {
      setLoadedUserId(null);
      return;
    }
    if (loadedUserId === user.id || !supabase || !isSupabaseConfigured) {
      return;
    }

    const loadAccentColor = async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("accent_color")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data?.accent_color && accentColorConfigs[data.accent_color as AccentColor]) {
          const nextAccent = data.accent_color as AccentColor;
          setAccentColorLocal(nextAccent);
        }
        setLoadedUserId(user.id);
      } catch (err) {
        console.error("Failed to load accent color:", err);
        setLoadedUserId(user.id);
      }
    };

    loadAccentColor();
  }, [user, loadedUserId, setAccentColorLocal]);

  // Apply CSS variables whenever accent color changes OR theme changes
  useEffect(() => {
    const applyAccentColors = () => {
      // Fallback to blue if accent color is invalid
      const validAccentColor = accentColorConfigs[accentColor] ? accentColor : "noir";
      const config = accentColorConfigs[validAccentColor];
      const root = document.documentElement;
      const isLight = root.classList.contains("light");
      const isNoir = validAccentColor === "noir";

      // Set data attribute for CSS targeting
      root.setAttribute("data-accent", validAccentColor);

      // Update basic CSS variables
      root.style.setProperty("--primary", config.primary);
      root.style.setProperty("--primary-glow", config.primaryGlow);
      root.style.setProperty("--ring", config.primary);
      root.style.setProperty("--ai-message-bg", config.aiMessageBg);
      root.style.setProperty("--ai-message-border", config.aiMessageBorder);
      root.style.setProperty("--user-message-bg", config.userMessageBg);
      root.style.setProperty("--user-message-border", config.userMessageBorder);

      // Primary foreground color: black text in light mode, white text in dark mode for readable buttons
      if (isLight) {
        root.style.setProperty("--primary-foreground", "0 0% 5%");
      } else {
        root.style.setProperty("--primary-foreground", "240 10% 98%");
      }

      if (isLight) {
        root.style.setProperty("--primary", config.lightPrimary);
        root.style.setProperty("--primary-glow", config.lightPrimaryGlow);
        root.style.setProperty("--ring", config.lightPrimary);
        root.style.setProperty("--ai-message-bg", config.lightAiMessageBg);
        root.style.setProperty("--ai-message-border", config.lightAiMessageBorder);

        if (!isNoir) {
          const [hue] = config.primary.split(" ");
          // Apply dynamic color tinting to light mode layout
          root.style.setProperty("--background", `${hue} 20% 99%`);
          root.style.setProperty("--card", `${hue} 20% 100%`);
          root.style.setProperty("--surface", `${hue} 20% 96%`);
          root.style.setProperty("--muted", `${hue} 15% 94%`);
          root.style.setProperty("--secondary", `${hue} 15% 92%`);
          root.style.setProperty("--border", `${hue} 20% 88%`);
          root.style.setProperty("--accent", `${hue} 20% 90%`);
          root.style.setProperty("--input", `${hue} 15% 96%`);
          root.style.setProperty("--glass-bg", `${hue} 20% 99%`);
          root.style.setProperty("--glass-border", `${hue} 20% 88%`);
        } else {
          // Let CSS values take over for noir
          root.style.removeProperty("--background");
          root.style.removeProperty("--card");
          root.style.removeProperty("--surface");
          root.style.removeProperty("--muted");
          root.style.removeProperty("--secondary");
          root.style.removeProperty("--border");
          root.style.removeProperty("--accent");
          root.style.removeProperty("--input");
          root.style.removeProperty("--glass-bg");
          root.style.removeProperty("--glass-border");
        }
      } else {
        // Dark Mode
        if (!isNoir) {
          const [hue] = config.primary.split(" ");
          // Apply dynamic color tinting to dark mode layout
          root.style.setProperty("--background", config.darkBackground || `${hue} 15% 1%`);
          root.style.setProperty("--card", `${hue} 15% 12%`);
          root.style.setProperty("--surface", `${hue} 12% 10%`);
          root.style.setProperty("--muted", `${hue} 10% 10%`);
          root.style.setProperty("--secondary", `${hue} 12% 28%`);
          root.style.setProperty("--border", `${hue} 16% 20%`);
          root.style.setProperty("--accent", `${hue} 16% 22%`);
          root.style.setProperty("--input", `${hue} 14% 12%`);
          root.style.setProperty("--input-dark", `${hue} 15% 15%`);
          root.style.setProperty("--glass-bg", `${hue} 12% 8%`);
          root.style.setProperty("--glass-border", `${hue} 16% 22%`);
        } else {
          // Let CSS values take over for noir
          root.style.removeProperty("--background");
          root.style.removeProperty("--card");
          root.style.removeProperty("--surface");
          root.style.removeProperty("--muted");
          root.style.removeProperty("--secondary");
          root.style.removeProperty("--border");
          root.style.removeProperty("--accent");
          root.style.removeProperty("--input");
          root.style.removeProperty("--input-dark");
          root.style.removeProperty("--glass-bg");
          root.style.removeProperty("--glass-border");
        }
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
