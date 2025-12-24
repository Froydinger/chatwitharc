import { useTheme } from "@/hooks/useTheme";
import { useAccentColor } from "@/hooks/useAccentColor";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const IMAGE_URL = "https://froydinger.com/wp-content/uploads/2025/12/soft-vintage-gradient-blur-background-with-pastel-colored.jpg";

export const BackgroundGradients = () => {
  const { accentColor: themeAccent } = useTheme();
  const { accentColor } = useAccentColor();

  // Force re-computation of CSS variable on every render to ensure we get latest value
  const [, forceUpdate] = useState(0);

  // Check if noir theme is active
  const isNoir = accentColor === "noir";

  useEffect(() => {
    // Force component update when accent changes
    forceUpdate(prev => prev + 1);
  }, [themeAccent, accentColor]);

  // Get the HSL value from CSS variable - always get fresh value
  const primaryGlow = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-glow')
    .trim();

  // Noir theme: subtler tinting
  const tintOpacity = isNoir ? 0.3 : 0.6;

  return (
    <motion.div
      key={`bg-image-${accentColor}`}
      className="fixed inset-0 pointer-events-none -z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Base image layer - full opacity */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url("${IMAGE_URL}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />
      {/* Color tint overlay using hue blend mode */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: `hsl(${primaryGlow})`,
          mixBlendMode: 'hue',
          opacity: tintOpacity,
        }}
      />
      {/* Additional color saturation layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: `hsl(${primaryGlow})`,
          mixBlendMode: 'color',
          opacity: tintOpacity * 0.5,
        }}
      />
      {/* Dark overlay to maintain readability */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'hsl(240 8% 8%)',
          opacity: isNoir ? 0.85 : 0.7,
        }}
      />
    </motion.div>
  );
};
