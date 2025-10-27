import { useState, useEffect } from 'react';

export type AccentColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange';

const accentColorConfigs = {
  red: {
    primary: '0 85% 60%',
    primaryGlow: '0 85% 70%',
    aiMessageBg: '0 15% 16%',
    aiMessageBorder: '0 20% 24%',
    lightAiMessageBg: '0 20% 97%',
    lightAiMessageBorder: '0 15% 92%',
    lightPrimary: '0 90% 55%',
    lightPrimaryGlow: '0 90% 65%',
  },
  blue: {
    primary: '200 95% 55%',
    primaryGlow: '200 90% 65%',
    aiMessageBg: '240 8% 16%',
    aiMessageBorder: '240 10% 24%',
    lightAiMessageBg: '220 20% 97%',
    lightAiMessageBorder: '220 15% 92%',
    lightPrimary: '200 100% 50%',
    lightPrimaryGlow: '200 100% 60%',
  },
  green: {
    primary: '142 76% 42%',
    primaryGlow: '142 76% 52%',
    aiMessageBg: '142 15% 16%',
    aiMessageBorder: '142 20% 24%',
    lightAiMessageBg: '142 20% 97%',
    lightAiMessageBorder: '142 15% 92%',
    lightPrimary: '142 76% 45%',
    lightPrimaryGlow: '142 76% 55%',
  },
  yellow: {
    primary: '48 95% 60%',
    primaryGlow: '48 95% 70%',
    aiMessageBg: '48 15% 16%',
    aiMessageBorder: '48 20% 24%',
    lightAiMessageBg: '48 20% 97%',
    lightAiMessageBorder: '48 15% 92%',
    lightPrimary: '48 95% 55%',
    lightPrimaryGlow: '48 95% 65%',
  },
  purple: {
    primary: '270 75% 60%',
    primaryGlow: '270 75% 70%',
    aiMessageBg: '270 15% 16%',
    aiMessageBorder: '270 20% 24%',
    lightAiMessageBg: '270 20% 97%',
    lightAiMessageBorder: '270 15% 92%',
    lightPrimary: '270 75% 55%',
    lightPrimaryGlow: '270 75% 65%',
  },
  orange: {
    primary: '25 95% 58%',
    primaryGlow: '25 95% 68%',
    aiMessageBg: '25 15% 16%',
    aiMessageBorder: '25 20% 24%',
    lightAiMessageBg: '25 20% 97%',
    lightAiMessageBorder: '25 15% 92%',
    lightPrimary: '25 95% 55%',
    lightPrimaryGlow: '25 95% 65%',
  },
};

export function useAccentColor() {
  const [accentColor, setAccentColor] = useState<AccentColor>(() => {
    const saved = localStorage.getItem('accentColor');
    return (saved as AccentColor) || 'blue';
  });

  useEffect(() => {
    const config = accentColorConfigs[accentColor];
    const root = document.documentElement;
    const isLight = root.classList.contains('light');

    // Update CSS variables for dark mode
    root.style.setProperty('--primary', config.primary);
    root.style.setProperty('--primary-glow', config.primaryGlow);
    root.style.setProperty('--ring', config.primary);
    root.style.setProperty('--ai-message-bg', config.aiMessageBg);
    root.style.setProperty('--ai-message-border', config.aiMessageBorder);

    // Update light mode CSS variables dynamically when in light mode
    if (isLight) {
      root.style.setProperty('--primary', config.lightPrimary);
      root.style.setProperty('--primary-glow', config.lightPrimaryGlow);
      root.style.setProperty('--ring', config.lightPrimary);
      root.style.setProperty('--ai-message-bg', config.lightAiMessageBg);
      root.style.setProperty('--ai-message-border', config.lightAiMessageBorder);
    }

    // Update selection color
    const style = document.getElementById('accent-selection-style') || document.createElement('style');
    style.id = 'accent-selection-style';
    const primaryRgb = hslToRgb(isLight ? config.lightPrimary : config.primary);
    style.textContent = `
      *::selection { background: rgb(${primaryRgb}) !important; color: white !important; }
      *::-moz-selection { background: rgb(${primaryRgb}) !important; color: white !important; }
      input::selection, textarea::selection { background: rgb(${primaryRgb}) !important; color: white !important; }
      input::-moz-selection, textarea::-moz-selection { background: rgb(${primaryRgb}) !important; color: white !important; }
    `;
    if (!style.parentElement) {
      document.head.appendChild(style);
    }

    // Apply logo glow with accent color
    const logoGlow = document.getElementById('logo-glow-style') || document.createElement('style');
    logoGlow.id = 'logo-glow-style';
    logoGlow.textContent = `
      .logo-accent-glow {
        position: relative;
        display: inline-block;
      }
      
      .logo-accent-glow::before {
        content: '';
        position: absolute;
        inset: -6px;
        background: hsl(${isLight ? config.lightPrimary : config.primary} / 0.2);
        border-radius: 50%;
        filter: blur(10px);
        animation: logo-breathe 3s ease-in-out infinite;
        pointer-events: none;
      }
      
      .header-logo-glow::before {
        inset: -3px;
        filter: blur(6px);
      }
      
      @keyframes logo-breathe {
        0%, 100% {
          opacity: 0.2;
          transform: scale(1);
        }
        50% {
          opacity: 0.4;
          transform: scale(1.05);
        }
      }
    `;
    if (!logoGlow.parentElement) {
      document.head.appendChild(logoGlow);
    }

    // Save to localStorage
    localStorage.setItem('accentColor', accentColor);
  }, [accentColor]);

  return { accentColor, setAccentColor };
}

// Helper to convert HSL to RGB for selection styles
function hslToRgb(hsl: string): string {
  const [h, s, l] = hsl.split(' ').map(v => parseFloat(v));
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return (l / 100) - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return `${Math.round(f(0) * 255)}, ${Math.round(f(8) * 255)}, ${Math.round(f(4) * 255)}`;
}
