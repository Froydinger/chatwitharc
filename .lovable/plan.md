

# Add Glass Pill Wrapper to Dashboard Chat Input

## Problem
The dashboard's `ChatInput` at line 347 of `DashboardPage.tsx` is wrapped in a plain `<div>` with no styling, so it lacks the glass pill container that the chat pages use via the `glass-dock` CSS class.

## Fix
Wrap the `ChatInput` on the dashboard in a `glass-dock` div, matching how `MobileChatApp.tsx` does it (line 982):

```tsx
// DashboardPage.tsx ~line 346-348
// Before:
<div>
  <ChatInput />
</div>

// After:
<div className="glass-dock" data-has-images={false}>
  <ChatInput />
</div>
```

The `glass-dock` class (defined in `src/index.css` lines 249-262 and `MobileChatApp.tsx` inline styles) provides:
- Rounded pill shape (`border-radius: 9999px`)
- Backdrop blur + semi-transparent background
- Subtle border and shadow
- Hover/focus-within glow effects

Since the dashboard page uses the same `ChatInput` component, the inner `chat-input-halo` class will be neutralized by the existing `.glass-dock .chat-input-halo` CSS rules, preventing doubled styling.

**Single file change**: `src/pages/DashboardPage.tsx` — one line modified.

