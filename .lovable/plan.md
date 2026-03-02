

# Account Hub - Transform Support Popup into Account Dashboard

## Overview
Replace the simple SupportPopup with a rich "Account Hub" modal showing user profile, subscription status, usage stats, and an AI-generated fun fact. Also add loading indicators when opening Stripe checkout/portal.

## What the user will see

A modal with these sections:
1. **Profile Header** - Avatar, display name, email, member-since date
2. **Subscription Card** - Current plan (Free/Pro), usage progress bars for daily messages and voice sessions, upgrade or manage button with loading spinner
3. **Stats Dashboard** - Chats this week/month/year, total memories, images generated
4. **Fun Fact** - AI-generated quirky fact about the user with a regenerate button
5. **Support Links** - Existing support links at the bottom

## Stripe Note
Stripe Checkout cannot be embedded in an iframe -- it must open in a new tab. A loading spinner will show while the checkout/portal URL is being fetched.

## Technical Details

### New Edge Functions

**`supabase/functions/user-stats/index.ts`**
- Authenticated endpoint querying `chat_sessions`, `context_blocks`, and `generated_files` tables
- Returns: `{ chats_week, chats_month, chats_year, memories, images_generated }`

**`supabase/functions/generate-fun-fact/index.ts`**
- Reads user's context blocks and profile data
- Uses Lovable AI (Gemini Flash) to generate a playful one-liner fact about the user
- Returns: `{ fun_fact: string }`

### Component Changes

**`src/components/SupportPopup.tsx`** -- Full rewrite to AccountHub
- Profile section using `useAuth` and `useProfile`
- Subscription section using `useSubscription` (with loading states on checkout/portal buttons)
- Stats section fetching from `user-stats` edge function
- Fun fact section fetching from `generate-fun-fact` with regenerate
- Support links preserved at bottom

**`src/components/MobileChatApp.tsx`** -- Update references
- Change icon label from "Support" to "Account"
- Update component import

### Loading States
- Checkout/portal buttons show a spinner while the URL is being fetched
- Stats section shows skeleton loaders while loading
- Fun fact shows skeleton while generating

