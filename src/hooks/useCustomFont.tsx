import { useEffect } from 'react';

export const AVAILABLE_FONTS = [
  { id: 'Inter', label: 'Inter (Default)' },
  { id: 'Geist', label: 'Geist' },
  { id: 'Manrope', label: 'Manrope' },
  { id: 'Space Grotesk', label: 'Space Grotesk' },
  { id: 'DM Sans', label: 'DM Sans' },
  { id: 'Outfit', label: 'Outfit' },
  { id: 'IBM Plex Sans', label: 'IBM Plex Sans' },
  { id: 'JetBrains Mono', label: 'JetBrains Mono' },
] as const;

export type CustomFontId = typeof AVAILABLE_FONTS[number]['id'];

const STORAGE_KEY = 'customFont';

export function applyCustomFont(font: string | null) {
  const value = font && font.trim().length > 0 ? font : 'Inter';
  document.documentElement.style.setProperty('--ui-font', value);
}

export function getStoredCustomFont(): CustomFontId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && AVAILABLE_FONTS.some((f) => f.id === v)) return v as CustomFontId;
  } catch {}
  return 'Inter';
}

export function setStoredCustomFont(font: CustomFontId) {
  try {
    localStorage.setItem(STORAGE_KEY, font);
  } catch {}
  applyCustomFont(font);
}

/** Apply the saved custom font on mount. Safe to call multiple times. */
export function useCustomFont() {
  useEffect(() => {
    applyCustomFont(getStoredCustomFont());
  }, []);
}
