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

  // Noir theme: much subtler tinting
  const tintOpacity = isNoir ? 0.15 : 0.45;
  const imageOpacity = isNoir ? 0.08 : 0.25;

  return (
    <motion.div
      key={`bg-image-${accentColor}`}
      className="fixed pointer-events-none -z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      style={{
        inset: 0,
        width: '100%',
        height: '100%',
      }}
    >
      {/* Base image layer */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url("${IMAGE_URL}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: imageOpacity,
          filter: 'blur(0px)',
        }}
      />
      {/* Color tint overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: `hsl(${primaryGlow})`,
          mixBlendMode: 'color',
          opacity: tintOpacity,
        }}
      />
      {/* Darkening overlay for better contrast */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse at center, transparent 0%, hsl(240 8% 8% / 0.6) 100%)`,
        }}
      />
    </motion.div>
  );
};
