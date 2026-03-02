

## Auth Modal Tab Switcher + Upgrade-to-Subscribe Flow

### What's Changing

**1. Auth Modal: Replace bottom text link with a tab switcher at the top**

The current "Don't have an account? Sign up" text link at the bottom of the AuthModal will be replaced with a prominent pill-shaped tab switcher (Sign In / Sign Up) placed right below the logo/header area. This uses the existing glass styling to match the liquid glass aesthetic.

**2. UpgradeModal: Inline sign-up + checkout in one flow**

Currently, when a non-authenticated user clicks "Upgrade to Pro," the embedded checkout fails because Stripe requires an authenticated user. The upgrade modal will be enhanced to detect if the user is not logged in and show a combined flow:
- Step 1: Show a compact sign-up/sign-in form inline within the UpgradeModal
- Step 2: After successful auth, automatically transition to the embedded Stripe checkout

This lets users create an account and subscribe in one seamless flow without bouncing between modals.

---

### Technical Details

**File: `src/components/AuthModal.tsx`**
- Remove the toggle button at the bottom (`"Don't have an account? Sign up"`)
- Add a tab switcher component above the form fields, below the logo section
- Two pill-shaped tabs: "Sign In" and "Sign Up" with glass styling
- Tabs control the existing `isLogin` state
- Styling: rounded-full container with `bg-white/5 border border-white/10`, active tab gets `bg-white/10` with subtle glow

**File: `src/components/UpgradeModal.tsx`**
- Import `useAuth` hook to check authentication status
- Import auth-related components (supabase client, form fields)
- Add a `step` state: `'info' | 'auth' | 'checkout'`
- When user clicks "Upgrade to Pro":
  - If authenticated: go straight to checkout (current behavior)
  - If not authenticated: show an inline sign-up form (step = 'auth')
- After successful authentication, automatically advance to checkout (step = 'checkout')
- Include Google OAuth option in the inline auth form
- Back button navigates between steps

**File: `src/components/EmbeddedCheckout.tsx`**
- No changes needed -- it already works independently

**No backend changes required** -- existing auth and checkout edge functions handle everything.
