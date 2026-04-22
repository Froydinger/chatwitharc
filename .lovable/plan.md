# Settings Page Rehaul

A full restructure of `/dashboard/settings` to make it scannable, organized by intent, and consistent across desktop and mobile. Today everything lives in 3 tabs (Profile / Plan / Account) with an inconsistent grid that mixes profile, appearance, voice, model, privacy, on-device AI, exports, sign out, delete, admin all together.

## New Tab Structure

Replace the 3 generic tabs with **5 intent-driven sections**, navigated via a sticky sidebar on desktop and a horizontal scrollable pill row on mobile.

```text
1. Account          – Identity, email, connected accounts, password, sign out, delete
2. Appearance       – Accent color, starfield, (future: theme bits)
3. AI & Models      – Model family, voice, on-device AI, image defaults
4. Privacy & Data   – Corporate Mode, memory link, export, clear chats, sync status
5. Plan & Usage     – Subscription state, usage meters, upgrade/manage
```

Admin Panel link remains conditional, surfaced inside **Account** at the bottom.

## Layout

**Desktop (≥ lg):**

```text
┌─────────────────────────────────────────────────────────┐
│  Settings                            [Web v4.1.3]       │
├──────────────┬──────────────────────────────────────────┤
│  Account     │                                          │
│  Appearance  │   <Active Section>                       │
│ ▸AI & Models │   (2-column responsive card grid)        │
│  Privacy     │                                          │
│  Plan        │                                          │
│              │                                          │
│  Support •   │                                          │
│  WTN         │                                          │
└──────────────┴──────────────────────────────────────────┘
```

- Sticky left rail (220px) with vertical nav, accent-glow on active item.
- Right pane: section header + responsive 2-column grid of `GlassCard`s (1-col under lg, 2-col at lg+). Cards keep current glass-bubble style and `staggerItemVariants` animation.

**Mobile (< lg):**

- Top: horizontal scroll pill bar of the 5 sections (snap-scroll, current pill highlighted with glass-shimmer + accent ring).
- Below: single-column stack of cards for the active section.
- Footer (Support / WTN / version) lives at the bottom of the scroll, not the rail.

## Card Reorganization


| Section            | Cards                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **Account**        | Profile (name + avatar combined), Email, Connected Accounts (Google/Apple/Email+pw), Sign Out, Delete Account, Admin (if admin) |
| **Appearance**     | Accent Color (full row), Starfield toggle                                                                                       |
| **AI & Models**    | Model Family (Gemini/GPT), Voice, Image Defaults (model + aspect ratio – pulled from `useImageGenStore`), On-Device AI          |
| **Privacy & Data** | Corporate Mode, Memory (link to Brain), Export Chats, Clear Chat History, Sync Status                                           |
| **Plan & Usage**   | Plan card, Today's Usage (free only), Manage Subscription / Upgrade                                                             |


Improvements per card:

- Consistent header pattern: `<Icon> <Title> + <one-line subtitle>` already used; standardize spacing.
- Combine "Your Name" + Avatar upload into one **Profile** card so identity edits live together.
- Add Image Defaults card so users can set model + aspect ratio outside chat (mirrors `ImageOptionsDock`).

## Technical Details

**Files to update**

- `src/components/SettingsPanel.tsx` – full restructure: extract each card into local subcomponents (`ProfileCard`, `AppearanceCards`, `ModelsCards`, `PrivacyCards`, `PlanCards`), build new shell with `useState<SectionId>` instead of `<Tabs>`. Keep all existing logic (handlers, hooks, modals) intact – only reorganize JSX. No behavior regressions.
- `src/pages/DashboardSettingsPage.tsx` – remove the page-level header (logo/title/back) duplication if the new shell renders its own; keep back button. Adjust max-width container to support sidebar layout (`max-w-6xl` → `max-w-7xl`, remove inner padding fight).

**New small pieces inside `SettingsPanel.tsx**`

```ts
type SectionId = 'account' | 'appearance' | 'ai' | 'privacy' | 'plan';
const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [...];
const [section, setSection] = useState<SectionId>('account');
```

- Sidebar nav: vertical buttons on `lg:flex`, hidden under lg.
- Mobile pill bar: `lg:hidden` horizontal `overflow-x-auto` row, snap-x, with the existing glass styling from `tabs.tsx`.
- Section content rendered via a switch on `section`, each branch returning a `motion.div` with `staggerContainerVariants` and a `grid lg:grid-cols-2 gap-6` layout.
- New **Image Defaults** card consumes `useImageGenStore` (already exists) and renders the same selectors used in `ImageOptionsDock` (compact variant).

**Preserved**

- All current handlers (`handleSaveDisplayName`, `handleAvatarUpload`, `handleSignOut`, `handlePasswordReset`, `handleDeleteAccount`, `handleClearMessages`, `handleAccentClick`, sync status logic).
- `LocalAIPanel`, `CorporateModePanel`, `VoiceSelector`, `ModelFamilySelector`, `DeleteDataModal` reused as-is.
- Footer (version + support links) moved into the sidebar bottom on desktop, kept at the page bottom on mobile.

**Out of scope**

- No changes to memory/Brain UI, Corporate Mode internals, or subscription logic.
- No theming changes beyond layout.  
  
  
  
**ALSO:** 
  **also can't seek at all on music, let's do a 10 sec forward and back to reconcile this once and for all with this fix.** 