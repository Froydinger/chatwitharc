# Settings and voice presence cleanup

SettingsPanel now uses the shared native sequencer for its existing section
exit-before-enter behavior. Section content, callbacks, grid geometry and
account/billing behavior are unchanged. VoiceModeOverlay removes six redundant
Framer presence wrappers around its existing native conditional transitions;
the handlers, hooks, camera/audio references and provider configuration are
unchanged. Dashboard navigation is excluded.

## Evidence and limits

- `node scripts/test-panel-motion-browser.mjs` passes sequence, rapid selection,
  inert outgoing content, reopen and reduced-motion cases on the actual adapter.
- `node scripts/test-motion-conditional-browser.mjs` passes guarded data,
  last-committed values, inert pointer/focus, interrupted reopen and exit cases.
- `node scripts/test-voice-webrtc.mjs` passes synthetic current transport,
  interruption/mute, tool-result single response, stale-event and disconnect
  cases. Network, real microphone and provider calls are disabled in this test.
- `test-voice-regressions.mjs` is not a passing gate: its old fake store lacks
  `subscribe` and its socket fixture expects the retired WebSocket transport.
  No production code was changed to satisfy that stale harness.
- Targeted lint still reports five errors and six Fast Refresh warnings in
  unchanged SettingsPanel/VoiceModeOverlay code (existing `any` and `ts-ignore`
  usage). The changed JSX/imports add none of those patterns.
- Production build/prerender and diff checks remain release gates.

These checks cover the native adapters and synthetic transport, not an
authenticated Settings interaction or real microphone/speaker session. The
earlier panel recording covers the native sequence pattern; this stage does
not claim a new recording of actual account settings or active voice.
