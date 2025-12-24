import { useTheme } from "@/hooks/useTheme";
import { useAccentColor } from "@/hooks/useAccentColor";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

const IMAGE_URL = "/images/gradient-bg.jpg";

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

  // Extract hue from HSL for CSS filter
  const hue = primaryGlow ? parseInt(primaryGlow.split(' ')[0]) : 200;
  // Calculate hue rotation from base (the image is warm/orange ~30deg)
  const hueRotate = hue - 30;

  return (
    <motion.div
      key={`bg-image-${accentColor}`}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: -1 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      {/* Tinted image using CSS filter */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url("${IMAGE_URL}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: `hue-rotate(${hueRotate}deg) saturate(${isNoir ? 0 : 1.2})`,
          opacity: isNoir ? 0.15 : 0.4,
        }}
      />
    </motion.div>
  );
};
