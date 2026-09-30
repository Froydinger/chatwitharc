import type { FlynnUser } from './flynnProvider.ts';
type Rpc = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export class ArcFlashAccessError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
/** Reserve once for the submitted user message, before any model/tool rounds. */
export async function reserveArcFlashSubmission(db: Rpc, user: FlynnUser | null, key: string | undefined, submissionId: string) {
  if (!user?.id || user.is_anonymous) throw new ArcFlashAccessError(403, 'Sign in to use Arc Flash.');
  if (!key?.trim()) throw new ArcFlashAccessError(503, 'Arc Flash is currently unavailable.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) throw new ArcFlashAccessError(400, 'Invalid submission identity.');
  const { data, error } = await db.rpc('reserve_arc_flash_message', { target_user_id: user.id, submission_id: submissionId });
  if (error || !data || typeof data !== 'object' || typeof (data as Record<string, unknown>).allowed !== 'boolean') {
    throw new ArcFlashAccessError(503, 'Arc Flash usage could not be checked. Please try again.');
  }
  const result = data as Record<string, unknown>;
  if (result.replayed === true) throw new ArcFlashAccessError(409, 'This message was already submitted. Check the chat before retrying.');
  return { allowed: result.allowed === true, unlimited: result.unlimited === true };
}

/** A narrow Auto fast path. Never reroutes explicit tools, artifacts or Work. */
export function shouldAutoUseFlash(options: {
  selection: unknown; lastUserText: unknown; stream: unknown; work: boolean; toolOrArtifact: boolean;
}): boolean {
  return options.selection === 'auto' && !options.stream && !options.work && !options.toolOrArtifact
    && typeof options.lastUserText === 'string'
    && /^(?:hey|hi|hello|thanks|thank you|good morning|good afternoon|good evening)[!.\s]*$/i.test(options.lastUserText.trim());
}
