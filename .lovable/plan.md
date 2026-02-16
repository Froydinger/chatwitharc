

## Voice Mode UI Redesign: Waveform Visualizer + Interrupt Button Fix

### 1. Replace Orb with Horizontal Audio Waveform

Remove the circular orb (lines 541-682) and replace it with a horizontal waveform bar -- a row of animated vertical bars that react to amplitude in real-time.

**Design:**
- ~20-30 vertical bars arranged horizontally, centered on screen
- Each bar's height driven by `inputAmplitude` (listening) or `outputAmplitude` (speaking), with per-bar randomization for organic feel
- **Listening state**: Smooth, gentle sine-wave motion with subtle breathing -- bars undulate softly
- **Speaking state**: Sharp, energetic peaks with faster transitions and more height variation
- **Thinking state**: Slow uniform pulse across all bars
- **Connecting state**: Sequential cascade animation (bars light up left-to-right in a loop)
- **Muted state**: All bars flatten to minimum height
- Bars use `hsl(var(--primary))` color with glow matching the current accent color
- Glass-style container behind the waveform (subtle `bg-muted/10 backdrop-blur-sm rounded-2xl` wrapper)
- Remove the outer glow rings, inner shimmer, listening pulse rings, and thinking dots that were part of the orb

**Technical approach:**
- Array of 24 `motion.div` bars, each with individual `animate` targeting `height` and `opacity`
- Height calculated as: `baseHeight + (amplitude * multiplier * perBarVariance)`
- Per-bar variance uses `Math.sin(index * frequency + time)` for wave shape
- Speaking mode uses higher frequency and sharper amplitude mapping
- The ear icon below the waveform stays as-is

### 2. Shrink Interrupt Button + Add Label

Current interrupt button (lines 719-735) is a large `p-5` circle with `w-8 h-8` icon -- too prominent.

**Changes:**
- Move it to the bottom control area, same visual weight as the mute/camera buttons
- Sizing: `p-3` padding with `w-5 h-5` icon (matches other action buttons)
- Add "Interrupt" text label next to the Hand icon
- Style: glass button (`glass-shimmer`) with primary accent border, not a solid primary background
- Layout: Positioned at bottom center, below the waveform and status text area

### Files Modified

**`src/components/VoiceModeOverlay.tsx`**
- Remove orb markup (lines 541-682): outer glow, main orb div, shimmer, connecting spinner, listening pulse rings, thinking dots
- Add waveform component in its place: 24 animated bars in a horizontal flex container
- Replace interrupt button (lines 719-735) with smaller bottom-positioned glass button including "Interrupt" text label

