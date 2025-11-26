import { useTheme } from "@/hooks/useTheme";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export const BackgroundGradients = () => {
  const { theme, accentColor } = useTheme();
  const isLight = theme === "light";

  // Force re-computation of CSS variable on every render to ensure we get latest value
  const [, forceUpdate] = useState(0);
  
  useEffect(() => {
    // Force component update when theme or accent changes
    forceUpdate(prev => prev + 1);
  }, [theme, accentColor]);

  // Get the HSL value from CSS variable - always get fresh value
  const primaryGlow = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-glow')
    .trim();

  // Parse HSL to create lighter version for light mode
  const getLighterHsl = (hsl: string) => {
    const parts = hsl.split(' ');
    if (parts.length === 3) {
      const hue = parts[0];
      const saturation = parts[1];
      // Increase lightness for light mode
      return `${hue} ${saturation} 85%`;
    }
    return hsl;
  };

  const lightModeColor = getLighterHsl(primaryGlow);

  return (
    <>
      {/* Primary gradient */}
      <motion.div
        key={`bg-primary-${accentColor}-${theme}`}
        className="fixed inset-0 pointer-events-none -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
        style={{
          background: isLight
            ? `linear-gradient(135deg, hsl(${lightModeColor}) 0%, hsl(${primaryGlow}) 50%, hsl(${lightModeColor}) 100%)`
            : `radial-gradient(circle at 20% 50%, hsl(${primaryGlow} / 0.25) 0%, transparent 100%)`,
          animation: isLight 
            ? 'global-background-drift-light 20s linear infinite' 
            : 'global-background-drift 20s linear infinite',
        }}
      />

      {/* Secondary gradient */}
      <motion.div
        key={`bg-secondary-${accentColor}-${theme}`}
        className="fixed inset-0 pointer-events-none -z-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        style={{
          background: isLight
            ? `radial-gradient(circle at 30% 70%, hsl(${primaryGlow}) 0%, hsl(${lightModeColor}) 50%, transparent 100%)`
            : `radial-gradient(circle at 80% 80%, hsl(${primaryGlow} / 0.2) 0%, transparent 100%)`,
          animation: isLight
            ? 'light-background-drift-secondary 25s linear infinite'
            : 'background-drift-secondary 25s linear infinite',
        }}
      />
    </>
  );
};
