import { useAuth } from '@/hooks/useAuth';

/**
 * Video generation is limited to a hard email allowlist rather than the Boost
 * tier.
 *
 * OpenAI removes the Videos API and every sora-2 model on 2026-09-24, so
 * selling this as a plan feature would mean charging for something with an
 * eight-week life. It stays private until a provider exists that will still
 * be around.
 *
 * This list MUST match two server-side copies: VIDEO_ACCESS_EMAILS in
 * supabase/functions/generate-video/index.ts, and the array in
 * public.user_can_generate_video. This check only controls whether the UI is
 * offered — the server enforces the real gate, so an edit here alone grants
 * nothing.
 *
 * To change the allowlist, add a NEW migration. Editing an applied one does
 * nothing: Supabase tracks migrations by version, never re-runs a version it
 * has already recorded, and does not compare file contents — so the edit
 * looks correct in git while production keeps the old list. That already
 * happened once here (20260731130000 was edited post-apply, fixed forward by
 * 20260731150000). The canonical list is whichever forward migration ran last.
 */
const VIDEO_ACCESS_EMAILS = new Set([
  'jkrd09@gmail.com',
  'jakefroydinger@gmail.com',
  'j@froydinger.com',
]);

export function useVideoAccess(): { canGenerateVideo: boolean } {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase();
  return { canGenerateVideo: !!email && VIDEO_ACCESS_EMAILS.has(email) };
}
