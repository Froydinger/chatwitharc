import { useTheme } from "@/hooks/useTheme";
import { useAccentColor } from "@/hooks/useAccentColor";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export const BackgroundGradients = () => {
  const { accentColor: themeAccent } = useTheme();
  const { accentColor } = useAccentColor();

  // Force re-computation of CSS variable on every render to ensure we get latest value
  const [, forceUpdate] = useState(0);

  // Check if noir theme is active
  const isNoir = accentColor === "noir";

  // Detect iPad PWA
  const isIpadPWA = () => {
    if (typeof window === 'undefined') return false;

    const ua = navigator.userAgent;
    const isIpad = (
      (ua.includes('iPad') ||
      (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)) &&
      !ua.includes('iPhone')
    );

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        (window.navigator as any).standalone === true;

    return isIpad && isStandalone;
  };

  const shouldSimplify = isIpadPWA();

  useEffect(() => {
    // Force component update when accent changes
    forceUpdate(prev => prev + 1);
  }, [themeAccent, accentColor]);

  // Get the HSL value from CSS variable - always get fresh value
  const primaryGlow = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-glow')
    .trim();

  // Noir theme: much subtler gradients
  const opacityMultiplier = isNoir ? 0.15 : 1;

  // Simplified static gradient for iPad PWA
  if (shouldSimplify) {
    return (
      <motion.div
        key={`bg-static-${accentColor}`}
        className="fixed pointer-events-none -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: `radial-gradient(circle at center,
            hsl(${primaryGlow} / ${0.15 * opacityMultiplier}) 0%,
            hsl(${primaryGlow} / ${0.08 * opacityMultiplier}) 40%,
            transparent 70%)`,
        }}
      />
    );
  }

  // Single static gradient - no animation for better performance
  return (
    <motion.div
      key={`bg-static-${accentColor}`}
      className="fixed pointer-events-none -z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        top: '-25%',
        left: '-25%',
        width: '150%',
        height: '150%',
        background: `radial-gradient(circle at center,
          hsl(${primaryGlow} / ${0.18 * opacityMultiplier}) 0%,
          hsl(${primaryGlow} / ${0.1 * opacityMultiplier}) 30%,
          hsl(${primaryGlow} / ${0.04 * opacityMultiplier}) 55%,
          transparent 75%)`,
      }}
    />
  );
};
