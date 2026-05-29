The landing page CTA and a few related spots still say "Unlimited chats and voice" — but the free tier is actually 10 voice conversations per 30 days. This is misleading and needs fixing.

## Changes

1. **LandingScreen.tsx — pricing section sub-headline**
  - Current: "No subscription, no credit card, no paywalls. Unlimited chats and voice, plus 10 image generations every day."
  - New: "No subscription & no credit card to start. Unlimited chats, 10 voice conversations per month, and 10 image generations every day. Upgrade if you need more."
2. **SettingsPanel.tsx — Free plan description tile**
  - Current: "Unlimited chats and voice. 10 image generations per day."
  - New: "Unlimited chats. 10 voice conversations per 30 days. 10 image generations per day."
3. **RouteSEO.tsx — meta description**
  - Current: "Optional ArcAi Boost"
  - New: "Upgrade via ArcAi Boost" (to match the paid-upgrade framing already applied elsewhere)

These are all text-only edits — no logic, no components, no backend changes.