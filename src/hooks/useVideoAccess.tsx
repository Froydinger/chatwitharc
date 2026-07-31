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
 * This list MUST match the array in public.user_can_generate_video
 * (supabase/migrations/20260731130000_restrict_video_to_allowlist.sql). This
 * check only controls whether the UI is offered — the server enforces the
 * real gate, so an edit here alone grants nothing.
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
