

## Fix: Waveform Animation Stops During AI Speech

### Root Cause

The waveform bars during `speaking` state calculate their height from `outputAmplitude`, which comes from an `AnalyserNode` connected to audio buffer sources. The problem is:

1. Audio is played as discrete short chunks (buffer sources). Between chunks, there is no active source feeding the analyser, so amplitude reads as 0.
2. When amplitude drops to 0, the keyframe animation heights collapse (e.g. `peakHeight` becomes ~4px, `midHeight` becomes ~4px), making bars appear frozen/flat.
3. The animation technically runs, but it bounces between near-zero values -- invisible to the eye.

### Fix

**Decouple the speaking animation from real-time amplitude.** When `status === 'speaking'`, the bars should animate with full energy regardless of the amplitude value. The amplitude can add extra punch but should never reduce bars below a strong baseline.

### Changes

**`src/components/VoiceModeOverlay.tsx`** -- `WaveformBar` speaking branch (lines 102-129):

- Use fixed, energetic keyframe heights that do NOT collapse when amplitude is 0
- Set a generous floor: bars bounce between 30-70% of maxHeight even with zero amplitude
- Amplitude adds bonus height on top (extra energy when audio data is present)
- This means bars always look alive during the entire speaking state

```text
// Before (broken):
const amp = Math.max(amplitude, 0.05);
const peakHeight = minHeight + amp * 90 * variance ...  // collapses when amp ~0

// After (fixed):
const baseEnergy = 0.35; // minimum bounce even with no amplitude data
const amp = Math.max(amplitude, baseEnergy);
const peakHeight = minHeight + amp * 70 * variance + (1 - distFromCenter) * 20;
const midHeight = minHeight + amp * 30 * variance + (1 - distFromCenter) * 10;
// Bars always bounce visibly, amplitude just makes them more intense
```

### Files to modify
1. `src/components/VoiceModeOverlay.tsx` -- Update the `isSpeaking` branch in `WaveformBar` to use a high floor amplitude so bars never collapse

