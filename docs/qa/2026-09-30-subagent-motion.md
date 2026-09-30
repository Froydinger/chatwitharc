# Parallel helper progress native motion

SubagentProgress now uses the existing native panel presence adapter, CSS chip entrances, and native keyed layout movement instead of Framer Motion. Closing snapshots are inert and interrupted closing reopens safely. Reduced motion disables chip entrances and the working spinner. The run store, provider calls, task labels, status text, counters, and status colors are preserved.

Validation:

- `node scripts/test-subagent-motion-browser.mjs` passed with the actual component and Zustand store at 412px and 1280px, normal and reduced motion. Covers planning, two-task plan, working, completion counters, stable keyed DOM during status changes, synthesis, terminal completion, failure text, aria-busy cleanup, inert exit, interrupted reopening, and final removal.
- `ARC_RECORD_MOTION=1 node scripts/test-subagent-motion-browser.mjs` passed and recorded 3.89 seconds. Captured frame inspected. Recording saved to `/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/arc-subagent-native-motion.mp4`.
- Targeted component and DEV fixture ESLint passed; `git diff --check` passed.
- Production build passed in 2.13 seconds and prerendered 16 pages.

Runs and task data in this fixture are synthetic, with no model calls or authenticated request. This does not prove provider execution or paid entitlement. Fixture disposal restores the prior store value. Dashboard navigation is untouched.
