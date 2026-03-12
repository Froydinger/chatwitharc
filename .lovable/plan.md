

## Problem

On iOS PWA, the top of the UI goes under the Dynamic Island / status bar. The main views need `env(safe-area-inset-top)` handling for iPhone PWA mode.

Looking at the code:

- **MobileChatApp.tsx** (the main chat view) has NO `env(safe-area-inset-top)` at all — it only has `pt-[30px]` for desktop standalone and admin banner padding. This is the primary broken view on iOS PWA.
- **DashboardPage.tsx** and **DashboardSettingsPage.tsx** DO have `env(safe-area-inset-top)` in their inline paddingTop — these should be working correctly.

The fix needs to add iOS safe area inset to **MobileChatApp** (and its floating header), which is the view the user sees most on iOS PWA.

## Plan

### 1. Fix MobileChatApp.tsx — root container (line ~626-634)

Add `env(safe-area-inset-top)` to the root div's paddingTop. Currently it only handles desktop standalone (`pt-[30px]`) and admin banner. Change the style to always include the safe area inset:

```typescript
style={{
  paddingTop: `calc(env(safe-area-inset-top, 0px) + ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'} + ${isDesktopStandalone ? '30px' : '0px'})`,
}}
```

Remove the `pt-[30px]` from className since it's now handled in the inline style.

### 2. Fix MobileChatApp.tsx — floating header (line ~651-655)

The fixed header's `top` position needs to account for the safe area inset too, so it doesn't overlap the dynamic island:

```typescript
top: `calc(env(safe-area-inset-top, 0px) + ${isAdminBannerActive ? 'var(--admin-banner-height, 0px)' : '0px'} + ${isDesktopStandalone ? '30px' : '0px'})`
```

### 3. Verify DashboardPage.tsx and DashboardSettingsPage.tsx

These already have `env(safe-area-inset-top, 0px)` in their paddingTop calc — no changes needed.

Two targeted edits in one file. No new dependencies.

