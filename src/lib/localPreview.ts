/**
 * UI-only preview switch for local Vite development.
 *
 * This is intentionally impossible to enable in a production build so it
 * cannot bypass the normal landing/auth flow for real users.
 */
export function isLocalChatPreview() {
  return import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview') === 'chat';
}
