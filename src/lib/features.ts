/**
 * Guest ("chat without logging in") mode.
 *
 * Currently OFF because Anonymous Sign-Ins are disabled on the Supabase
 * project — Authentication -> Sign In / Providers -> Anonymous Sign-Ins.
 * With the provider off, signInAnonymously() fails, so exposing the entry
 * point would just hand users a button that can't work.
 *
 * The rest of guest mode is intact and stays intact: useRequireAuth's gates,
 * GlobalAuthGate's contextual copy, the isAnonymous checks throughout the app,
 * anon_usage, cleanup-anonymous-users, and the chat function's guest path.
 * Flip this to true once the provider is enabled and the whole flow comes
 * back — this constant is the only switch.
 */
export const GUEST_CHAT_ENABLED = false;
