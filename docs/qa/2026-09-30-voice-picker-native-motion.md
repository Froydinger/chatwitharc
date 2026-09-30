# Voice picker native motion

Replaces VoiceMagneticPicker's Framer spring, layout and pulse with native CSS individual translate/scale, reduced-motion preference and keyed WAAPI layout transitions. Voice catalog, IDs, geometry, ordering, labels and selection callbacks match baseline 707717dd; no provider/session/audio code changes.

Validation:
- Source parity script passed, including unchanged provider voice catalog.
- Actual component browser fixture passed at 412/1280 widths, compact/full, normal/reduced motion: pointer attraction/release, stable keyed recentering, selected size and callback, one selected choice, no overflow.
- Keyboard Enter selection and dynamic reduced-motion reset passed. Initial keyboard test omitted the CDP Enter text payload; corrected test passed without changing production keyboard behavior.
- Targeted component/fixture lint passed.
- Recorded 4.53 seconds and visually inspected the selected/recentered frame. Durable local video: Documents/ArcAI QA/2026-09-30/arc-voice-picker-native-motion.mp4.

Evidence is isolated actual-component browser behavior, not audible voice/session E2E. Fixture does not access the microphone or start a voice session. Dashboard navigation components untouched.
