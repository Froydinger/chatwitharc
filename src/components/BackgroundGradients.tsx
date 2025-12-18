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

  return (
    <>
      {/* Primary gradient - GPU accelerated */}
      <motion.div
        key={`bg-primary-${accentColor}`}
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
            hsl(${primaryGlow} / ${0.2 * opacityMultiplier}) 0%, 
            hsl(${primaryGlow} / ${0.18 * opacityMultiplier}) 10%,
            hsl(${primaryGlow} / ${0.16 * opacityMultiplier}) 15%,
            hsl(${primaryGlow} / ${0.15 * opacityMultiplier}) 20%, 
            hsl(${primaryGlow} / ${0.12 * opacityMultiplier}) 25%,
            hsl(${primaryGlow} / ${0.1 * opacityMultiplier}) 30%,
            hsl(${primaryGlow} / ${0.08 * opacityMultiplier}) 40%, 
            hsl(${primaryGlow} / ${0.05 * opacityMultiplier}) 50%,
            hsl(${primaryGlow} / ${0.03 * opacityMultiplier}) 60%, 
            hsl(${primaryGlow} / ${0.015 * opacityMultiplier}) 70%,
            hsl(${primaryGlow} / ${0.01 * opacityMultiplier}) 80%, 
            hsl(${primaryGlow} / ${0.005 * opacityMultiplier}) 90%,
            transparent 100%)`,
          willChange: 'transform',
          transform: 'translateZ(0)',
          animation: 'background-drift-primary 22s linear infinite',
        }}
      />

      {/* Secondary gradient - GPU accelerated */}
      <motion.div
        key={`bg-secondary-${accentColor}`}
        className="fixed pointer-events-none -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        style={{
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: `radial-gradient(circle at center, 
            hsl(${primaryGlow} / ${0.15 * opacityMultiplier}) 0%, 
            hsl(${primaryGlow} / ${0.13 * opacityMultiplier}) 10%,
            hsl(${primaryGlow} / ${0.12 * opacityMultiplier}) 15%,
            hsl(${primaryGlow} / ${0.11 * opacityMultiplier}) 20%, 
            hsl(${primaryGlow} / ${0.09 * opacityMultiplier}) 25%,
            hsl(${primaryGlow} / ${0.07 * opacityMultiplier}) 30%,
            hsl(${primaryGlow} / ${0.06 * opacityMultiplier}) 40%, 
            hsl(${primaryGlow} / ${0.04 * opacityMultiplier}) 50%,
            hsl(${primaryGlow} / ${0.02 * opacityMultiplier}) 60%, 
            hsl(${primaryGlow} / ${0.01 * opacityMultiplier}) 70%,
            hsl(${primaryGlow} / ${0.005 * opacityMultiplier}) 80%, 
            hsl(${primaryGlow} / ${0.002 * opacityMultiplier}) 90%,
            transparent 100%)`,
          willChange: 'transform',
          transform: 'translateZ(0)',
          animation: 'background-drift-secondary 25s linear infinite',
        }}
      />
    </>
  );
};
