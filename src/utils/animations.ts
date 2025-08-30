// Robust animation utilities to prevent glitches
import { Variants } from "framer-motion";

// Remove all initial transforms to prevent layout shifts and glitches
export const fadeInVariants: Variants = {
  initial: {
    opacity: 1, // Start fully visible to prevent flash
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0,
      ease: "linear",
    },
  },
};

export const slideUpVariants: Variants = {
  initial: {
    opacity: 1,
    y: 0,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0,
      ease: "linear",
    },
  },
};

export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0,
      delayChildren: 0,
    },
  },
};

export const staggerItemVariants: Variants = {
  initial: {
    opacity: 1,
    y: 0,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0,
      ease: "linear",
    },
  },
};

// Simple variants with no transforms to prevent glitches
export const welcomeTextVariants: Variants = {
  initial: {
    opacity: 1,
    y: 0,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0,
      ease: "linear",
    },
  },
};

export const inputBarVariants: Variants = {
  initial: {
    opacity: 1,
    y: 0,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0,
      ease: "linear",
    },
  },
};

export const cardVariants: Variants = {
  initial: {
    opacity: 1,
    scale: 1,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0,
      ease: "linear",
    },
  },
};

// Animation configuration to prevent layout shifts
export const animationConfig = {
  // Reduce motion for users with motion preferences
  respectMotionPreference: true,
  // Use transform instead of layout properties
  layoutId: undefined,
  // Prevent animations completely
  transition: {
    duration: 0,
  },
};

// Helper to create consistent page animations (no animations)
export const createPageVariants = (delay: number = 0): Variants => ({
  initial: {
    opacity: 1,
  },
  animate: {
    opacity: 1,
    transition: {
      duration: 0,
    },
  },
});