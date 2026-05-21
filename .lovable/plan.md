Plan to make the assistant reveal feel polished and reliable:

1. **Fix the trigger condition**
  - Stop treating `isLoading` as “still thinking” once assistant text exists.
  - Use the word reveal renderer whenever the latest assistant message has content, instead of falling back to instant markdown while streaming.
2. **Replace chunk-based reveal with a real word queue**
  - Rework `WordStreamMarkdown` so incoming chunks are buffered and released word-by-word on a consistent animation clock.
  - The full response will not become visible just because the backend sends a large chunk.
  - Keep already-revealed words stable so they never reanimate or flicker.
3. **Make the blur-to-unblur animation smoother**
  - Use performant per-word CSS: opacity + small translate + blur-to-clear, with `inline-block` and reduced layout churn.
  - Tune timing so it feels luxurious, not slow: fast enough for long replies, visibly animated for short replies.
4. **Protect markdown and heavy content**
  - Keep code blocks, generated files, SVG artifacts, media embeds, and tables from breaking the animation.
  - Animate normal text/list/header words, while complex blocks render safely once their surrounding text reaches them.
5. **Verify the path**
  - Check the latest assistant response behavior in preview: first token, mid-stream chunks, long response tail, and completed message.
  - Confirm older chat history still renders instantly and reduced-motion users do not get animations.
6. **Change background of AI responses to half their current opacity, to distinguish them from user message bubble.**