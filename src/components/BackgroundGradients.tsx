import { useTheme } from "@/hooks/useTheme";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export const BackgroundGradients = () => {
  const { accentColor } = useTheme();

  // Force re-computation of CSS variable on every render to ensure we get latest value
  const [, forceUpdate] = useState(0);
  
  useEffect(() => {
    // Force component update when accent changes
    forceUpdate(prev => prev + 1);
  }, [accentColor]);

  // Get the HSL value from CSS variable - always get fresh value
  const primaryGlow = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-glow')
    .trim();

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
            hsl(${primaryGlow} / 0.2) 0%, 
            hsl(${primaryGlow} / 0.18) 10%,
            hsl(${primaryGlow} / 0.16) 15%,
            hsl(${primaryGlow} / 0.15) 20%, 
            hsl(${primaryGlow} / 0.12) 25%,
            hsl(${primaryGlow} / 0.1) 30%,
            hsl(${primaryGlow} / 0.08) 40%, 
            hsl(${primaryGlow} / 0.05) 50%,
            hsl(${primaryGlow} / 0.03) 60%, 
            hsl(${primaryGlow} / 0.015) 70%,
            hsl(${primaryGlow} / 0.01) 80%, 
            hsl(${primaryGlow} / 0.005) 90%,
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
            hsl(${primaryGlow} / 0.15) 0%, 
            hsl(${primaryGlow} / 0.13) 10%,
            hsl(${primaryGlow} / 0.12) 15%,
            hsl(${primaryGlow} / 0.11) 20%, 
            hsl(${primaryGlow} / 0.09) 25%,
            hsl(${primaryGlow} / 0.07) 30%,
            hsl(${primaryGlow} / 0.06) 40%, 
            hsl(${primaryGlow} / 0.04) 50%,
            hsl(${primaryGlow} / 0.02) 60%, 
            hsl(${primaryGlow} / 0.01) 70%,
            hsl(${primaryGlow} / 0.005) 80%, 
            hsl(${primaryGlow} / 0.002) 90%,
            transparent 100%)`,
          willChange: 'transform',
          transform: 'translateZ(0)',
          animation: 'background-drift-secondary 25s linear infinite',
        }}
      />
    </>
  );
};
