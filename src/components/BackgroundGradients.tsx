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
      {/* Primary gradient */}
      <motion.div
        key={`bg-primary-${accentColor}`}
        className="fixed inset-0 pointer-events-none -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          background: `radial-gradient(circle at 20% 50%, hsl(${primaryGlow} / 0.2) 0%, hsl(${primaryGlow} / 0.15) 20%, hsl(${primaryGlow} / 0.08) 40%, hsl(${primaryGlow} / 0.03) 60%, hsl(${primaryGlow} / 0.01) 80%, transparent 100%)`,
          animation: 'global-background-drift 20s linear infinite',
        }}
      />

      {/* Secondary gradient */}
      <motion.div
        key={`bg-secondary-${accentColor}`}
        className="fixed inset-0 pointer-events-none -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        style={{
          background: `radial-gradient(circle at 80% 80%, hsl(${primaryGlow} / 0.15) 0%, hsl(${primaryGlow} / 0.11) 20%, hsl(${primaryGlow} / 0.06) 40%, hsl(${primaryGlow} / 0.02) 60%, hsl(${primaryGlow} / 0.005) 80%, transparent 100%)`,
          animation: 'background-drift-secondary 25s linear infinite',
        }}
      />
    </>
  );
};
