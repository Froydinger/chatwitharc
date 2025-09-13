// Enhanced bouncy animation utilities with spring physics
import { Variants } from "framer-motion";

// Bouncy fade in with spring effect
export const fadeInVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.8,
  },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94],
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
  },
};

// Rubber band slide up effect
export const slideUpVariants: Variants = {
  initial: {
    opacity: 0,
    y: 60,
    scale: 0.9,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.8,
      type: "spring",
      stiffness: 300,
      damping: 20,
      mass: 0.8,
    },
  },
};

// Staggered bouncy container
export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
      type: "spring",
    },
  },
};

// Playful bounce-in items
export const staggerItemVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.6,
    rotate: -5,
  },
  animate: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      duration: 0.7,
      type: "spring",
      stiffness: 500,
      damping: 15,
    },
  },
};

// Welcome text with gentle bounce
export const welcomeTextVariants: Variants = {
  initial: {
    opacity: 0,
    y: -30,
    scale: 0.9,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.8,
      type: "spring",
      stiffness: 200,
      damping: 25,
    },
  },
};

// Input bar with spring bounce
export const inputBarVariants: Variants = {
  initial: {
    opacity: 0,
    y: 100,
    scale: 0.95,
  },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.9,
      type: "spring",
      stiffness: 180,
      damping: 20,
      mass: 1,
    },
  },
};

// Enhanced card with rubber band effect
export const cardVariants: Variants = {
  initial: {
    opacity: 0,
    scale: 0.8,
    rotateY: -20,
  },
  animate: {
    opacity: 1,
    scale: 1,
    rotateY: 0,
    transition: {
      duration: 0.7,
      type: "spring",
      stiffness: 300,
      damping: 18,
    },
  },
  hover: {
    scale: 1.05,
    rotateY: 5,
    transition: {
      duration: 0.3,
      type: "spring",
      stiffness: 400,
      damping: 15,
    },
  },
};

// Spring animation configuration
export const animationConfig = {
  respectMotionPreference: true,
  transition: {
    type: "spring",
    stiffness: 300,
    damping: 25,
  },
};

// Enhanced page variants with bounce
export const createPageVariants = (delay: number = 0): Variants => ({
  initial: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.6,
      delay,
      type: "spring",
      stiffness: 250,
      damping: 20,
    },
  },
});