import { useAccentColor } from "@/hooks/useAccentColor";
import { motion } from "framer-motion";

// Color configs for the gradient - must match useAccentColor
const glowColors: Record<string, string> = {
  red: "0 85% 70%",
  blue: "200 90% 65%",
  green: "142 76% 52%",
  yellow: "48 95% 70%",
  purple: "270 75% 70%",
  orange: "25 95% 68%",
  noir: "0 0% 75%",
};

export const BackgroundGradients = () => {
  const { accentColor } = useAccentColor();

  const isNoir = accentColor === "noir";

  // Get the glow color directly from config
  const primaryGlow = glowColors[accentColor] || glowColors.blue;

  // Noir theme: much subtler gradients
  const opacityMultiplier = isNoir ? 0.15 : 1;

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
