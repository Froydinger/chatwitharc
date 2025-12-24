import { useTheme } from "@/hooks/useTheme";
import { useAccentColor } from "@/hooks/useAccentColor";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export const BackgroundGradients = () => {
  const { accentColor: themeAccent } = useTheme();
  const { accentColor } = useAccentColor();

  const [, forceUpdate] = useState(0);
  const isNoir = accentColor === "noir";

  useEffect(() => {
    forceUpdate(prev => prev + 1);
  }, [themeAccent, accentColor]);

  // Get the HSL value from CSS variable
  const primaryGlow = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-glow')
    .trim();

  // Noir theme: much subtler gradient
  const opacityMultiplier = isNoir ? 0.15 : 1;

  return (
    <motion.div
      key={`bg-static-${accentColor}`}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -1 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Single static radial gradient orb from center */}
      <div
        style={{
          position: 'absolute',
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
    </motion.div>
  );
};
