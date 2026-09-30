# Notification prompt native motion

PWAInstallPrompt is the notification-permission suggestion, not the installation flow. It now delegates its panel to NotificationPromptView using native panel presence. The old !show early return is removed so dismissed content can finish its inert exit. Permission/auth opt-out gates still return immediately as before. The dismissal accessible label now correctly says seven days, matching the existing cooldown.

Validation:

- Source parity confirms unchanged auth/permission gates, 2.5s timer, seven-day cooldown, storage keys and enable/dismiss/forever handlers. All original event bindings match.
- Actual view tests passed at 412px/1280px with normal/reduced motion: open, loading-disabled enable, callback ports, inert dismissal, interrupted reopening, final removal and overflow.
- Harness quote syntax was repaired; the exit assertion now waits 450ms rather than checking at exactly the configured 350ms boundary. No production animation timing change was made to accommodate tests.
- New view/DEV fixture lint passed and git diff check passed. Controller retains its pre-existing explicit-any catch lint error; whole-file lint is not claimed green.
- Build passed in 1.90s and prerendered 16 pages.
- Recorded 4.13 seconds. Inspected an open frame extracted at 1s and the closed captured frame. Local recording: `/Users/jakefreudinger/Documents/ArcAI QA/2026-09-30/arc-notification-prompt-native-motion.mp4`.

The fixture invokes synthetic callbacks only; it does not request browser permission, subscribe notifications, send a ping, or change notification preferences. Protected shared GlassButton and dashboard notification/navigation animations are untouched.
