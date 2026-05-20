# Magical Message Arrival

Goal: make every Arc response feel alive — arriving in its own glass bubble with a one-shot aurora halo, words materializing as Arc "thinks," the logo pulsing the moment speech begins, and a tiny settle bounce when the thought is complete.

## 1. Assistant gets a real bubble

Currently user messages live inside `.user-message-bubble` (glowy glass) while assistant text is free-floating (`relative cursor-pointer w-full min-w-0` in `MessageBubble.tsx`). We'll mirror the user treatment with an assistant-tuned variant.

- Add `.arc-message-bubble` in `src/index.css` — same glass aesthetic as the input dock and user bubble (24px backdrop-blur, `rgba(20,20,25,0.6)` bg, subtle border, `liquid-rim` inset highlight), but slightly larger max-width and a softer left-leaning radius (`rounded-[22px]` with `rounded-tl-md` for the "from Arc" tail feel).
- In `MessageBubble.tsx`, when `!isUser` and message is `text`, swap the bare wrapper for the new bubble class. Keep `min-w-0`, keep code blocks / weather / image / canvas/IDE artifacts **outside** the bubble (they already render their own surfaces — wrapping them in glass would double-up).
- Preserve current max-width `85%`; assistant bubble can go up to `92%` since it carries the answer.

## 2. Aurora halo — one-shot on arrival

A soft, accent-colored radial glow blooms outside the bubble, peaks, and fades. One pulse only, then calm.

- New keyframe `aurora-halo` in `index.css`:
  - 0%: `box-shadow: 0 0 0 0 hsl(var(--primary)/0), 0 0 0 0 hsl(var(--primary)/0)`
  - 30%: `box-shadow: 0 0 32px 4px hsl(var(--primary)/0.35), 0 0 80px 20px hsl(var(--primary)/0.18)`
  - 100%: `box-shadow: 0 0 0 0 hsl(var(--primary)/0), 0 0 0 0 hsl(var(--primary)/0)`
- Duration ~1.6s, `cubic-bezier(0.22, 1, 0.36, 1)`, runs **once** via a one-shot class `.arc-halo-once` applied on mount and removed via `onAnimationEnd`.
- Trigger: applied when the assistant bubble first receives content (i.e. on the latest assistant message when `isLatestAssistant && shouldAnimateTypewriter`, mounted with the bubble). Historical messages on scroll-back do **not** re-pulse.

## 3. Word-by-word fade-up streaming

Replace the char-by-char `TypewriterMarkdown` cadence on the latest streaming message with word reveal. Historical messages render instantly (no animation).

- New component `WordStreamMarkdown.tsx` (lives next to `TypewriterMarkdown.tsx`, doesn't replace it — code blocks, weather, etc. still need plain render).
- Splits the *currently streamed text* into tokens on whitespace, preserving punctuation. Each new word that appears beyond the last render gets wrapped in a `<span class="arc-word">` whose CSS animation is `arc-word-in 320ms cubic-bezier(0.22,1,0.36,1)` — `opacity 0→1`, `translateY(4px)→0`, `filter: blur(2px)→0`.
- Performance guardrails:
  - Only animate words appended in the last tick; never re-animate already-rendered words (track via index).
  - Skip animation entirely once total word count > 600 (long-form research answers) to avoid jank — fall back to instant render for the tail.
  - Markdown structural elements (headings, list bullets, code blocks) render normally; only paragraph/text nodes get the per-word treatment. Implementation: custom `p` / `li` renderers that split children strings into animated word spans.
- Existing `TypewriterMarkdown` stays for any non-chat surfaces that still use it.

## 4. Logo handoff pulse — thinking → speaking

The `ThinkingIndicator` currently shows during the wait. The instant the first assistant token lands, the Arc logo emits one quick light pulse, then sits still.

- Add `arc-logo-pulse` keyframe: scale 1 → 1.08 → 1 over 480ms, simultaneously a radial `drop-shadow` flash in `hsl(var(--primary)/0.6)` that fades to 0.
- In `MobileChatApp` (or wherever the streaming Arc logo lives during response), watch for the transition `isThinking → false && message.content.length > 0` for the latest assistant message; toggle a one-shot `.arc-logo-pulse` class on the `ThemedLogo`, cleared via `onAnimationEnd`.
- If a logo isn't currently rendered inline (most chat views don't show one per-message), the pulse fires on the header/dock Arc logo instead — visually anchors the "Arc just started talking" moment.

## 5. Settle bounce on final token

When streaming completes (the message transitions from "streaming" to "done"), the bubble does a tiny `scale(1) → 1.01 → 1` bounce — like it just exhaled.

- Add `arc-settle` keyframe: `transform: scale(1)` → `1.012` at 50% → `1` at 100%, duration 420ms, `cubic-bezier(0.34, 1.56, 0.64, 1)` (soft overshoot).
- Trigger: in `MessageBubble`, when `shouldAnimateTypewriter` flips from `true` to `false` on the latest assistant message (or when `WordStreamMarkdown` reports "done"), add `.arc-settle-once`, remove on `animationend`.

## Reduced motion

All four effects are wrapped in `@media (prefers-reduced-motion: no-preference)`. With reduced motion: bubble appears, words render instant, no halo, no pulse, no bounce.

## Files touched

- `src/index.css` — `.arc-message-bubble`, `.arc-halo-once`, `.arc-logo-pulse`, `.arc-settle-once`, four keyframes, reduced-motion guard.
- `src/components/MessageBubble.tsx` — wrap assistant text in new bubble; mount halo class on first paint of latest streaming assistant message; mount settle class on stream-end.
- `src/components/WordStreamMarkdown.tsx` *(new)* — word-tokenizing markdown renderer for the streaming tail.
- `src/components/MobileChatApp.tsx` *(or the latest-message container)* — fire `.arc-logo-pulse` on first-token transition.
- `src/components/ThemedLogo.tsx` — accept optional `className` pulse pass-through (already does — no change needed beyond passing the class).

## Out of scope

- No changes to user bubbles, code blocks, image generation flow, or thinking indicator copy.
- No new sound, no particle systems, no haptics.
- No changes to streaming/backend logic — purely presentational on the rendered text.
