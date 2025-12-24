import { useAccentColor } from "@/hooks/useAccentColor";
import { motion } from "framer-motion";
import { useState, useEffect } from "react";

export const BackgroundGradients = () => {
  const { accentColor } = useAccentColor();
  const [primaryGlow, setPrimaryGlow] = useState("200 90% 65%");

  const isNoir = accentColor === "noir";

  // Read the CSS variable directly so we react to changes
  useEffect(() => {
    const updateGlow = () => {
      const computed = getComputedStyle(document.documentElement).getPropertyValue("--primary-glow").trim();
      if (computed) {
        setPrimaryGlow(computed);
      }
    };
    
    // Update immediately
    updateGlow();
    
    // Also update after a tiny delay to catch async CSS var changes
    const timeout = setTimeout(updateGlow, 50);
    
    return () => clearTimeout(timeout);
  }, [accentColor]);

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

  // Simplified static gradient for iPad PWA
  if (shouldSimplify) {
    // Noir gets a subtle silver/gray gradient, others get colored glow
    const gradientStyle = isNoir
      ? `radial-gradient(ellipse 120% 80% at 50% 20%,
          hsl(0 0% 25% / 0.5) 0%,
          hsl(0 0% 15% / 0.3) 40%,
          hsl(0 0% 8% / 0.15) 70%,
          transparent 100%)`
      : `radial-gradient(circle at center,
          hsl(${primaryGlow} / 0.15) 0%,
          hsl(${primaryGlow} / 0.08) 40%,
          transparent 70%)`;

    return (
      <motion.div
        key={`bg-static-${accentColor}-${primaryGlow}`}
        className="fixed pointer-events-none -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          background: gradientStyle,
        }}
      />
    );
  }

  // Noir gets a subtle silver/gray gradient from top, others get colored glow
  const gradientStyle = isNoir
    ? `radial-gradient(ellipse 130% 70% at 50% 15%,
        hsl(0 0% 28% / 0.55) 0%,
        hsl(0 0% 18% / 0.35) 35%,
        hsl(0 0% 10% / 0.18) 60%,
        transparent 90%)`
    : `radial-gradient(circle at center,
        hsl(${primaryGlow} / 0.18) 0%,
        hsl(${primaryGlow} / 0.1) 30%,
        hsl(${primaryGlow} / 0.04) 55%,
        transparent 75%)`;

  return (
    <motion.div
      key={`bg-static-${accentColor}-${primaryGlow}`}
      className="fixed pointer-events-none -z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        top: '-25%',
        left: '-25%',
        width: '150%',
        height: '150%',
        background: gradientStyle,
      }}
    />
  );
};
