## Goal

Mirror the existing left-edge swipe (which opens the sidebar) with an opposite right-edge swipe that navigates to `/dashboard` from the new chat screen.

## Where

`src/components/MobileChatApp.tsx`, in the same PWA/standalone edge-swipe `useEffect` (currently lines 248–304) that already handles the sidebar gesture.

## Behavior

- Trigger: only on mobile + PWA/standalone (same gating as sidebar swipe), and only when on the new chat screen (route `/` and no active messages) — matches "from new chat screen".
- Gesture: touch starts within ~24px of the right edge, horizontal drag left ≥ 50px, vertical drift < 60px.
- Must not fire while the sidebar (`rightPanelOpen`) is open, and must not conflict with the existing left→right open-sidebar swipe (right-edge start zone is disjoint from the left-half start zone).
- Action: `navigate('/dashboard')` using the existing `useNavigate` already imported in the file.

## Implementation sketch

Inside the existing `onTouchStart` / `onTouchMove` handlers, add a parallel `trackingDashboard` flag:

```text
onTouchStart:
  if !rightPanelOpen
     && isNewChatScreen   // location.pathname === '/' && messages.length === 0
     && touch.clientX > innerWidth - 24:
       startX, startY = touch; trackingDashboard = true

onTouchMove:
  if trackingDashboard && dx < -50 && |dy| < 60:
       trackingDashboard = false
       navigate('/dashboard')
```

Reset `trackingDashboard` in `onTouchEnd` alongside `tracking`.

## Out of scope

- No changes to the Dashboard page itself.
- No new animations beyond the standard route transition already in `PageTransition`.
- Desktop and non-PWA mobile web behavior unchanged.
