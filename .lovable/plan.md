## What's actually causing the AI bubble background

There's an inline `<style>` block inside `src/components/MobileChatApp.tsx` (lines ~1214-1228) with this rule:

```css
.chat-messages [class*="bubble"] {
  background: rgba(18,18,18,0.42) !important;
  border: 1px solid rgba(255,255,255,0.06) !important;
  border-radius: 18px !important;
  backdrop-filter: blur(8px) saturate(118%) !important;
  box-shadow: 0 2px 10px ..., inset ... !important;
}
```

The wildcard `[class*="bubble"]` matches **any** class containing the substring "bubble" — so it catches `arc-message-bubble` (the AI message wrapper). Because this style is injected after `index.css`, its `!important` wins over the `.arc-message-bubble { background: transparent !important }` rule I added. That's why nothing I changed in `index.css` made a visible difference.

## Fix

One-line change in `src/components/MobileChatApp.tsx`:

```diff
- .chat-messages [class*="bubble"]{
+ .chat-messages [class*="bubble"]:not(.arc-message-bubble){
```

That excludes only the AI message container; the user bubble (`user-message-bubble`) is unaffected and keeps its glowy glass look.

## Cleanup

Also revert the now-unnecessary `!important` overrides I added in `src/index.css` for `.arc-message-bubble` so it goes back to the clean original:

```css
.arc-message-bubble {
  position: relative;
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 0;
}
```

## Result

- AI message text renders as free-floating text on the page — no bg, no border, no rounded rect, no blur.
- User bubble unchanged (still glowy glass).
- No other code or behavior touched.