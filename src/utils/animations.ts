// Unified, smooth animation system - consistent timing, easing, and feel across the entire app
import { Variants, TargetAndTransition } from "framer-motion";

// ============================================================================
// ANIMATION CONSTANTS - Unified standards for all animations
// ============================================================================

// Duration standards (in seconds)
export const ANIMATION_DURATION = {
  INSTANT: 0.15,     // Very quick feedback (taps, hovers)
  QUICK: 0.25,       // Quick UI responses
  STANDARD: 0.4,     // Default entrance/exit animations
  SMOOTH: 0.5,       // Smooth, noticeable transitions
  SLOW: 0.6,         // Slower, more graceful animations
  VERY_SLOW: 0.8,    // Deliberate, slow animations
} as const;

// Easing standards - optimized for smooth, polished feel
export const EASING = {
  // Spring easing - feels natural and responsive
  SPRING_SMOOTH: { type: "spring", stiffness: 300, damping: 30, mass: 1 },
  SPRING_BOUNCY: { type: "spring", stiffness: 400, damping: 20, mass: 0.8 },
  SPRING_SNAPPY: { type: "spring", stiffness: 500, damping: 25, mass: 0.6 },
  SPRING_GENTLE: { type: "spring", stiffness: 250, damping: 35, mass: 1.2 },

  // Cubic bezier easing - for fine-tuned control
  EASE_OUT_SMOOTH: [0.25, 0.46, 0.45, 0.94],        // Natural deceleration
  EASE_OUT_CUBIC: [0.25, 0.8, 0.25, 1],             // Smoother deceleration
  EASE_OUT_QUART: [0.165, 0.84, 0.44, 1],           // Very smooth
  EASE_IN_OUT_CUBIC: [0.645, 0.045, 0.355, 1],      // Smooth both directions
  EASE_OUT_BACK: [0.175, 0.885, 0.32, 1.275],       // Slight overshoot
} as const;

// Stagger standards - consistent spacing between child animations
export const STAGGER = {
  TIGHT: 0.04,       // Very tight stagger (dense lists)
  NORMAL: 0.06,      // Default stagger (most components)
  LOOSE: 0.08,       // Relaxed stagger (spacious layouts)
  VERY_LOOSE: 0.1,   // Very loose stagger (special effects)
} as const;

// GPU acceleration base config - applied to all animated elements
const gpuAccelerate = {
  backfaceVisibility: 'hidden' as const,
  perspective: 1000,
  transform: 'translateZ(0)',
  willChange: 'transform, opacity' as const,
};

// ============================================================================
// ANIMATION CONFIGURATION
// ============================================================================

export const animationConfig = {
  respectMotionPreference: true,
  transition: EASING.SPRING_SMOOTH,
  defaultValues: {
    opacity: 1,
    scale: 1,
    y: 0,
    x: 0,
    rotate: 0,
  },
};

// ============================================================================
// CORE ANIMATION VARIANTS - Used throughout the app
// ============================================================================

// Fade in - simple opacity fade with subtle scale
export const fadeInVariants: Variants = {
  initial: { opacity: 0, scale: 0.98, ...gpuAccelerate },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: ANIMATION_DURATION.STANDARD, ...EASING.SPRING_SMOOTH },
    ...gpuAccelerate,
  },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.2 } },
};

// Slide up - entrance from below with fade
export const slideUpVariants: Variants = {
  initial: { opacity: 0, y: 20, ...gpuAccelerate },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: ANIMATION_DURATION.SMOOTH, ...EASING.SPRING_SMOOTH },
    ...gpuAccelerate,
  },
  exit: { opacity: 0, y: 10, transition: { duration: 0.15 } },
};

// Slide down - entrance from above with fade
export const slideDownVariants: Variants = {
  initial: { opacity: 0, y: -20, ...gpuAccelerate },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: ANIMATION_DURATION.SMOOTH, ...EASING.SPRING_SMOOTH },
    ...gpuAccelerate,
  },
  exit: { opacity: 0, y: -10, transition: { duration: 0.15 } },
};

// Slide right - entrance from left with fade
export const slideRightVariants: Variants = {
  initial: { opacity: 0, x: -20, ...gpuAccelerate },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: ANIMATION_DURATION.SMOOTH, ...EASING.SPRING_SMOOTH },
    ...gpuAccelerate,
  },
  exit: { opacity: 0, x: -10, transition: { duration: 0.15 } },
};

// Scale in - entrance with scale and fade
export const scaleInVariants: Variants = {
  initial: { opacity: 0, scale: 0.9, ...gpuAccelerate },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: ANIMATION_DURATION.STANDARD, ...EASING.SPRING_BOUNCY },
    ...gpuAccelerate,
  },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.15 } },
};

// Stagger container - parent for staggered children
export const staggerContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: STAGGER.NORMAL,
      delayChildren: 0.05,
    },
  },
  exit: {
    transition: {
      staggerChildren: STAGGER.NORMAL * 0.5,
      staggerDirection: -1,
    },
  },
};

// Stagger item - child of stagger container
export const staggerItemVariants: Variants = {
  initial: { opacity: 0, y: 12, ...gpuAccelerate },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: ANIMATION_DURATION.STANDARD, ...EASING.SPRING_SMOOTH },
    ...gpuAccelerate,
  },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15 } },
};

// Welcome text - special entrance for headers and titles
export const welcomeTextVariants: Variants = {
  initial: { opacity: 0, y: -15, ...gpuAccelerate },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: ANIMATION_DURATION.SMOOTH, ...EASING.SPRING_GENTLE },
    ...gpuAccelerate,
  },
};

// Input bar - special smooth entrance with more weight
export const inputBarVariants: Variants = {
  initial: { opacity: 0, y: 30, scale: 0.96, ...gpuAccelerate },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: ANIMATION_DURATION.SLOW, ...EASING.SPRING_SMOOTH },
    ...gpuAccelerate,
  },
};

// Card variants - interactive cards with hover state
export const cardVariants: Variants = {
  initial: { opacity: 0, scale: 0.95, y: 15, ...gpuAccelerate },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: ANIMATION_DURATION.SMOOTH, ...EASING.SPRING_SMOOTH },
    ...gpuAccelerate,
  },
  hover: {
    scale: 1.03,
    y: -4,
    transition: { duration: ANIMATION_DURATION.QUICK, ...EASING.SPRING_BOUNCY },
    ...gpuAccelerate,
  },
  tap: {
    scale: 0.97,
    transition: { duration: ANIMATION_DURATION.INSTANT, ...EASING.SPRING_BOUNCY },
  },
};

// Modal variants - for dialogs and popups
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.92, ...gpuAccelerate },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: ANIMATION_DURATION.SMOOTH, ...EASING.SPRING_SMOOTH },
    ...gpuAccelerate,
  },
  exit: { opacity: 0, scale: 0.92, transition: { duration: 0.2 } },
};

// Button variants - for interactive buttons
export const buttonVariants: Variants = {
  initial: { opacity: 1 },
  hover: {
    scale: 1.05,
    transition: { duration: ANIMATION_DURATION.QUICK, ...EASING.SPRING_SNAPPY },
  },
  tap: {
    scale: 0.96,
    transition: { duration: ANIMATION_DURATION.INSTANT, ...EASING.SPRING_BOUNCY },
  },
};

// ============================================================================
// HELPER FUNCTIONS - Generate custom animation variants
// ============================================================================

// Create stagger container for a list of items
export const createStaggerContainer = (staggerAmount = STAGGER.NORMAL): Variants => ({
  initial: {},
  animate: {
    transition: {
      staggerChildren: staggerAmount,
      delayChildren: 0.05,
    },
  },
});

// Create entrance animation with custom delay
export const createPageVariants = (delay: number = 0): Variants => ({
  initial: { opacity: 0, scale: 0.96, y: 12, ...gpuAccelerate },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: ANIMATION_DURATION.SMOOTH,
      delay,
      ...EASING.SPRING_SMOOTH,
    },
    ...gpuAccelerate,
  },
});

// Create fade animation with custom duration
export const createFadeVariants = (duration = ANIMATION_DURATION.STANDARD): Variants => ({
  initial: { opacity: 0, ...gpuAccelerate },
  animate: {
    opacity: 1,
    transition: { duration, ...EASING.SPRING_SMOOTH },
    ...gpuAccelerate,
  },
  exit: { opacity: 0, transition: { duration: 0.15 } },
});

// Create slide animation with custom direction and distance
export const createSlideVariants = (
  direction: 'up' | 'down' | 'left' | 'right' = 'up',
  distance: number = 20
): Variants => {
  const axisMap = {
    up: { y: distance },
    down: { y: -distance },
    left: { x: distance },
    right: { x: -distance },
  };

  const axis = axisMap[direction];

  return {
    initial: { opacity: 0, ...axis, ...gpuAccelerate },
    animate: {
      opacity: 1,
      ...Object.keys(axis).reduce((acc, key) => ({ ...acc, [key]: 0 }), {}),
      transition: { duration: ANIMATION_DURATION.SMOOTH, ...EASING.SPRING_SMOOTH },
      ...gpuAccelerate,
    },
    exit: { opacity: 0, transition: { duration: 0.15 } },
  };
};

// Create scale animation with bounce effect
export const createScaleVariants = (scaleTo = 1, scaleFrom = 0.9): Variants => ({
  initial: { opacity: 0, scale: scaleFrom, ...gpuAccelerate },
  animate: {
    opacity: 1,
    scale: scaleTo,
    transition: { duration: ANIMATION_DURATION.STANDARD, ...EASING.SPRING_BOUNCY },
    ...gpuAccelerate,
  },
  exit: { opacity: 0, scale: scaleFrom, transition: { duration: 0.15 } },
});

// Create hover effect
export const createHoverVariants = (scale = 1.05, yOffset = -4): TargetAndTransition => ({
  scale,
  y: yOffset,
  transition: { duration: ANIMATION_DURATION.QUICK, ...EASING.SPRING_BOUNCY },
});

// Create tap effect
export const createTapVariants = (scale = 0.96): TargetAndTransition => ({
  scale,
  transition: { duration: ANIMATION_DURATION.INSTANT, ...EASING.SPRING_BOUNCY },
});

// ============================================================================
// PRESET ANIMATIONS - Common animation combinations
// ============================================================================

// Hover and tap effects for buttons
export const interactiveButtonAnimation = {
  whileHover: createHoverVariants(1.05, -2),
  whileTap: createTapVariants(0.96),
};

// Hover and tap effects for cards
export const interactiveCardAnimation = {
  whileHover: createHoverVariants(1.03, -4),
  whileTap: createTapVariants(0.97),
};

// Quick feedback animations
export const quickFeedbackAnimation = {
  whileHover: { scale: 1.08, transition: { duration: ANIMATION_DURATION.INSTANT } },
  whileTap: { scale: 0.94, transition: { duration: ANIMATION_DURATION.INSTANT } },
};