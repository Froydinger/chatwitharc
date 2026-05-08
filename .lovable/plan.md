## Root cause

OpenAI's GA Realtime API (which `gpt-realtime-2` requires) rejects the legacy `openai-beta.realtime-v1` WebSocket subprotocol with `api_version_mismatch`. The proxy was correctly switched to the GA `/v1/realtime/client_secrets` endpoint last turn, but the client still sends the beta subprotocol — so every connection opens then immediately closes with code 4000.

Console confirms: `"You cannot start a Realtime beta session with a GA client secret... omit the 'openai-beta: realtime=v1' header."`

## Fix

In `src/hooks/useOpenAIRealtime.tsx` (line 682–689), remove the `'openai-beta.realtime-v1'` subprotocol from the `WebSocket` constructor:

```ts
const ws = new WebSocket(
  `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(realtimeModel)}`,
  [
    'realtime',
    `openai-insecure-api-key.${realtimeSession.client_secret}`,
    // removed: 'openai-beta.realtime-v1'
  ]
);
```

That's the only change needed. The proxy (GA `/v1/realtime/client_secrets` with `session.type: 'realtime'`) is already correct from the previous turn.

## Verification

After applying, voice mode should connect, stay open, and auto-listen (server VAD is on by default in GA sessions). I'll watch the console for the absence of the `api_version_mismatch` close and confirm the orb transitions to "listening".
