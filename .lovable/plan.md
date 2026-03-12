
Goal: eliminate the persistent Voice Error (1006), make voice startup resilient, and keep the picker clean with only Cedric + Marina while preserving compatibility.

What I found from your current setup
1) The client is successfully reaching your backend voice proxy and the proxy is successfully connecting upstream.
- Proxy logs repeatedly show:
  - “Authenticated WebSocket for user …”
  - “Connected to OpenAI Realtime”
2) Immediately after that, the browser-side socket is dropping with unexpected EOF repeatedly, which then triggers your client auto-reconnect loop and ends in “Voice connection lost (1006)”.
3) Voice list UX is already mostly simplified (Cedric + Marina shown), but runtime robustness still needs tightening.
4) Model string is currently hardcoded in the proxy to a preview model (`gpt-4o-realtime-preview-2025-06-03`), while your intended behavior is to use realtime model routing (“gpt-realtime” family).
5) There are still profile records in the backend with legacy voice values (e.g. coral/echo). Your client does fallback logic, but we should harden this path server-side and on session init to remove ambiguity.

Implementation plan (sequenced)
Phase 1 — Stabilize realtime model/session handshake
1. Update proxy upstream model selection to default to `gpt-realtime` (your expected production path), with optional fallback order.
2. Add explicit upstream lifecycle logging in proxy for:
- session creation message sent
- first upstream event type received
- upstream close code/reason
- client close code/reason
3. Add safe close propagation:
- if upstream closes, relay a structured error payload once, then close client socket with explicit reason
- if client closes, gracefully close upstream with normal code and skip noisy error loops

Phase 2 — Harden frontend connection state machine
1. Refine reconnect behavior in `useOpenAIRealtime`:
- do not reconnect for intentional disconnects/user deactivation
- exponential backoff (instead of tight 1s loop)
- stop reconnect on deterministic auth/config errors
2. Add a short “session-ready” gate:
- after WS open, wait for a valid session ack event before allowing mic stream commits
- prevents early message races that can destabilize startup
3. Improve surfaced errors:
- separate “couldn’t initialize voice session” from “network dropped”
- include upstream close reason when present (instead of generic 1006 only)

Phase 3 — Enforce two-voice policy cleanly (Cedric + Marina)
1. Keep picker UI constrained to Cedric + Marina everywhere (Account Hub + overlay).
2. Add runtime sanitizer on connect:
- if selected/persisted voice is not in allowed realtime set, force to `cedar` before session.update
3. Persist sanitized value back to profile when mismatch is detected, so future sessions are clean.

Phase 4 — Robust proxy/auth/config hardening
1. Ensure websocket auth path is fully deterministic:
- parse bearer token safely from protocol/header
- return explicit auth failure messages before attempting upstream
2. Add defensive handling for malformed/empty WS messages and buffer growth limits.
3. Add heartbeat/keepalive handling (or idle timeout strategy) so silent sessions don’t die unexpectedly on some networks.

Phase 5 — Validation pass (end-to-end)
1. Start voice from idle chat (Cedric) → confirm stable connect, no 1006.
2. Switch to Marina and restart session → confirm stable connect.
3. Mute/unmute and interrupt actions → confirm no forced disconnect.
4. Background tab/foreground return (mobile-like flow) → confirm reconnect behavior is controlled and recovers.
5. Confirm toasts are accurate:
- auth/config issue
- upstream unavailable
- transient network interruption
- true session loss after max retries

Technical notes (why this should fix your exact symptom)
- Your logs prove upstream connect is succeeding; failure is in post-connect lifecycle.
- The current reconnect loop masks root causes by repeatedly re-opening and failing.
- Moving to `gpt-realtime` + better lifecycle gating + clearer close propagation removes ambiguity and prevents the 1006 thrash loop.
- Sanitizing persisted voice values eliminates hidden profile/state mismatch risks when users have old voice preferences.

Files/components targeted in implementation
- `supabase/functions/openai-realtime-proxy/index.ts` (primary stability + model + close propagation)
- `src/hooks/useOpenAIRealtime.tsx` (reconnect logic, readiness gating, error surfacing)
- `src/components/VoiceModeController.tsx` (startup flow coordination if needed)
- `src/components/VoiceModeOverlay.tsx` and `src/components/VoiceSelector.tsx` (confirm two-voice UX remains consistent)
- optional small backend data normalization for profile `preferred_voice` values

Expected outcome
- Voice mode starts reliably without immediate 1006 loops
- Cleaner, deterministic error handling when something truly fails
- Only Cedric + Marina visible, with safe fallback behavior under the hood
- Overall “robust as hell” startup/reconnect behavior instead of fragile retry churn
