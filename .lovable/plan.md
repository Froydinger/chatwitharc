
Goal: fix unpublish so it never locks the screen, and if it fails it reports clearly while retrying in the background once.

What I found
- The screen lock is coming from `src/components/ide/PublishDialog.tsx`:
  - `AlertDialogAction` calls `e.preventDefault()`, which prevents Radix from closing the confirm dialog.
  - The dialog is not controlled via `open/onOpenChange`, so there is no manual close path after preventDefault.
  - Result: overlay/focus trap can stay active and lock the whole UI.
- Failure visibility is weak:
  - `handleUnpublish` in `src/components/ide/IDECanvasPanel.tsx` catches errors and does not rethrow, so caller-level error handling can’t reliably react.
  - `unpublishFromNetlify` parsing is brittle (`res.json()` only), so non-JSON error bodies can become generic errors.
- You asked for non-blocking behavior + background retry: we should release UI immediately and run unpublish in background.

Implementation plan
1) Fix the lock at the source (PublishDialog)
- Refactor confirm flow in `PublishedStatusView`:
  - Add controlled state for the confirmation dialog (`confirmOpen`).
  - Remove `e.preventDefault()` from destructive action.
  - On confirm: immediately close confirm dialog (and optionally close publish dialog), then run unpublish async in background.
- Keep UI interactive while unpublish runs:
  - No blocking overlay after confirm.
  - Show a small “Unpublishing in background…” status/toast instead of trapping interaction.

2) Make unpublish contract explicit (IDECanvasPanel)
- Update `handleUnpublish` so errors propagate to caller:
  - Do not swallow errors silently.
  - Check DB update result and throw on `error` (currently ignored).
- Return a clear success/failure signal so publish dialog can:
  - show success toast on completion,
  - show actionable failure toast if both attempts fail.

3) Add one background retry with clear messaging
- In `PublishedStatusView` flow:
  - Attempt unpublish once.
  - If it fails, wait briefly (e.g. ~1.5–2s) and retry once automatically in background.
  - If second attempt fails, show explicit error (no lock, no spinner dead-end), with copy like:
    - “Couldn’t unpublish right now. Please try again.”
- Ensure button state resets in all paths.

4) Harden unpublish request parsing (deploy.ts)
- In `unpublishFromNetlify`:
  - Gracefully parse response as JSON when possible, fallback to text.
  - Normalize timeout/abort message so user sees real reason.
  - Keep abort timeout, but surface deterministic errors to UI.

5) Harden backend delete timeout + diagnostics (edge function)
- In `supabase/functions/deploy-netlify/index.ts` delete branch:
  - Wrap Netlify DELETE with an AbortController timeout to avoid long hangs.
  - Return structured JSON errors on timeout/failure.
  - Add concise logs for start/fail/success of delete requests.

Technical details (exact files)
- `src/components/ide/PublishDialog.tsx`
  - control AlertDialog open state
  - remove preventDefault deadlock pattern
  - background unpublish + one retry + clear UI feedback
- `src/components/ide/IDECanvasPanel.tsx`
  - make `handleUnpublish` propagate errors and validate DB update result
- `src/lib/deploy.ts`
  - robust response parsing + normalized error messages for unpublish
- `supabase/functions/deploy-netlify/index.ts`
  - timeout wrapper around Netlify delete + improved error payload/logging

Validation checklist
- Confirm unpublish no longer locks the full screen (mobile viewport 390x844 and desktop).
- Confirm confirmation modal closes immediately after clicking Unpublish.
- Confirm background retry runs once on failure.
- Confirm failure is visible and actionable (not silent, not endless spinner).
- Confirm success clears published state (`netlify_url`, `netlify_site_id`, `netlify_subdomain`) and UI reflects unpublished status.
