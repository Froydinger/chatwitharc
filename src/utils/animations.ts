// Enhanced smooth animation utilities with spring physics and GPU acceleration
import { Variants } from "framer-motion";

// Base smooth config for all animations
const smoothConfig = {
  backfaceVisibility: 'hidden' as const,
  transform: 'translateZ(0)',
  willChange: 'transform, opacity' as const,
};

// Smooth fade in with spring effect
export const fadeInVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    ...smoothConfig,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
      type: "spring",
      stiffness: 300,
      damping: 30,
    },
    ...smoothConfig,
  },
};

// Smooth slide up effect
export const slideUpVariants: Variants = {
  initial: {
    opacity: 0,
    y: 30,
    scale: 0.98,
    ...smoothConfig,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      type: "spring",
      stiffness: 300,
      damping: 25,
      mass: 0.6,
    },
    ...smoothConfig,
  },
};

// Smooth stagger container
export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
      type: "spring",
    },
  },
};

// Smooth stagger items
export const staggerItemVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 10,
    ...smoothConfig,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.4,
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
    ...smoothConfig,
  },
};

// Welcome text with smooth entrance
export const welcomeTextVariants: Variants = {
  initial: {
    opacity: 0,
    y: -20,
    scale: 0.98,
    ...smoothConfig,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      type: "spring",
      stiffness: 250,
      damping: 25,
    },
    ...smoothConfig,
  },
};

// Input bar with smooth spring
export const inputBarVariants: Variants = {
  initial: {
    opacity: 0,
    y: 40,
    scale: 0.98,
    ...smoothConfig,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      type: "spring",
      stiffness: 250,
      damping: 25,
      mass: 0.8,
    },
    ...smoothConfig,
  },
};

// Smooth card animation
export const cardVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    ...smoothConfig,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.5,
      type: "spring",
      stiffness: 300,
      damping: 25,
    },
    ...smoothConfig,
  },
  hover: {
    scale: 1.02,
    y: -2,
    transition: {
      duration: 0.2,
      type: "spring",
      stiffness: 400,
      damping: 20,
    },
  },
};

// Smooth animation configuration
export const animationConfig = {
  respectMotionPreference: true,
  transition: {
    type: "spring",
    stiffness: 300,
    damping: 25,
  },
};

// Smooth page variants
export const createPageVariants = (delay: number = 0): Variants => ({
  initial: {
    opacity: 0,
    scale: 0.98,
    y: 15,
    ...smoothConfig,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.5,
      delay,
      type: "spring",
      stiffness: 300,
      damping: 25,
    },
    ...smoothConfig,
  },
});