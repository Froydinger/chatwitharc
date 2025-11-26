import { useTheme } from "@/hooks/useTheme";
import { motion } from "framer-motion";

export const BackgroundGradients = () => {
  const { theme, accentColor } = useTheme();
  const isLight = theme === "light";

  // Get the HSL value from CSS variable
  const primaryGlow = getComputedStyle(document.documentElement)
    .getPropertyValue('--primary-glow')
    .trim();

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
            ? `radial-gradient(circle at 20% 50%, transparent 0%, hsl(${primaryGlow} / 0.9) 100%)`
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
            ? `radial-gradient(circle at 70% 30%, transparent 0%, hsl(${primaryGlow} / 0.8) 100%)`
            : `radial-gradient(circle at 80% 80%, hsl(${primaryGlow} / 0.2) 0%, transparent 100%)`,
          animation: isLight
            ? 'light-background-drift-secondary 25s linear infinite'
            : 'background-drift-secondary 25s linear infinite',
        }}
      />
    </>
  );
};
