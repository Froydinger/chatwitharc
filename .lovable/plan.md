

## Problem

Two issues:

1. **Dashboard pages missing desktop PWA/Electron traffic light safe area** — `DashboardPage.tsx` and `DashboardSettingsPage.tsx` don't detect desktop standalone mode and don't add the `pt-[30px]` offset for macOS traffic lights. Every other major view (MobileChatApp, CanvasPanel, RightPanel, LandingScreen) handles this.

2. **Dashboard pages missing iOS dynamic island / safe area** — `DashboardPage.tsx` uses `env(safe-area-inset-top)` in its padding, which is correct for iOS. But `DashboardSettingsPage.tsx` has no safe-area-inset-top handling at all. Both pages need the desktop standalone offset added on top of the existing safe area logic.

## Plan

### 1. Add desktop standalone detection to `DashboardPage.tsx`
- Add `useState` + `useEffect` to detect desktop PWA/Electron (same pattern as MobileChatApp lines 190-204)
- Update the root `<div>` paddingTop style (line 272) to include `+ 30px` when `isDesktopStandalone` is true
- Formula: `calc(env(safe-area-inset-top, 0px) + ${banner} + ${standalone ? '30px' : '0px'})`

### 2. Add desktop standalone detection + safe area to `DashboardSettingsPage.tsx`
- Same standalone detection hook
- Update paddingTop (line 26) to include both `env(safe-area-inset-top)` and the 30px standalone offset
- Formula: `calc(env(safe-area-inset-top, 0px) + ${banner} + ${standalone ? '30px' : '0px'})`

Both files follow the exact same detection pattern already used in MobileChatApp. Two small edits, no new dependencies.

