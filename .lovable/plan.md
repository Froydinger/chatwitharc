# Fix: Voice mode listens but never responds

## Root cause

After removing the beta subprotocol the WebSocket connects to the GA Realtime endpoint, but the first `session.update` we send is still in the **legacy beta shape**:

```ts
session: {
  modalities: ['text','audio'],
  input_audio_format: 'pcm16',
  output_audio_format: 'pcm16',
  input_audio_transcription: { model: 'whisper-1' },
  turn_detection: { type:'server_vad', ... },
  voice: 'cedar',
  ...
}
```

GA `gpt-realtime-2` requires:
- `session.type: 'realtime'` on every `session.update`
- `audio.input` / `audio.output` nesting (format, transcription, turn_detection, voice all live there)
- `output_modalities` instead of `modalities`
- `whisper-1` transcription is fine, but it lives at `audio.input.transcription`

Because the server can't parse our config, server‑VAD never starts → user speaks, waveform animates from local mic capture, but no `input_audio_buffer.speech_stopped` / `response.create` ever fires → silence forever.

## Changes

**1. `src/hooks/useOpenAIRealtime.tsx` — rewrite the `session.update` payload (around line 766–846)**

```ts
ws.send(JSON.stringify({
  type: 'session.update',
  session: {
    type: 'realtime',
    instructions: systemPrompt || `You're Arc — ...`,
    output_modalities: ['audio'],
    audio: {
      input: {
        format: { type: 'audio/pcm', rate: 24000 },
        transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.6,           // 0.97 was way too strict; nothing crossed it
          prefix_padding_ms: 300,
          silence_duration_ms: 700,
          create_response: true,
        },
      },
      output: {
        format: { type: 'audio/pcm', rate: 24000 },
        voice: safeVoice,
      },
    },
    tools: [ /* same tool definitions, unchanged */ ],
    tool_choice: 'auto',
  },
}));
```

Also lower the `threshold` from `0.97` → `0.6`. The old 0.97 alone could explain "listens but never replies": almost no real‑world speech amplitude clears 0.97 normalized.

**2. Keepalive ping (line ~727)**

Change to GA‑shaped no‑op so it isn't rejected:
```ts
globalWs.send(JSON.stringify({ type: 'session.update', session: { type: 'realtime' } }));
```

**3. Anywhere else we emit `response.create` / `input_audio_buffer.append`** — those event names are unchanged in GA, no edit needed. Verify by searching once.

**4. No edge function changes** — `openai-realtime-proxy` already uses the GA `/client_secrets` endpoint correctly.

## Verification

After the edit:
- Open voice mode → console shows `Connected to OpenAI Realtime` then `session.created` / `session.updated` (no `invalid_request_error`)
- Speak → server emits `input_audio_buffer.speech_started` then `…speech_stopped` then `response.created` → Arc replies aloud.

If the server logs another `invalid_request_error`, paste it and I'll narrow further (most likely culprit would be `audio.input.format` shape — GA accepts both the string `"pcm16"` and the object form, the object form is the documented one).
