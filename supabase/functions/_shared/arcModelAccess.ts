import { ARC_ASTRA, ArcModelAccessError, arcRequestComplexity, arcRequestSelection, arcRequestTask,
  resolveArcModelRoute, type ArcModelTask } from './arcModelRouting.ts';

type AdminLookup = {
  from(name: string): { select(columns: string): { eq(column: string, value: string): {
    maybeSingle(): PromiseLike<{ data: { user_id?: string } | null; error: unknown }>;
  } } };
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Use only an authenticated user id and the existing server-owned admin table.
 * Client flags, emails and editable user_metadata never grant access. */
export async function isArcModelAdmin(db: AdminLookup, userId: string): Promise<boolean> {
  const { data, error } = await db.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle();
  if (error) throw new ArcModelAccessError('Model access could not be verified. Please try again.', 503);
  return data?.user_id === userId;
}

export async function authorizedArcModelRoute(db: AdminLookup,
  user: { id: string; is_anonymous?: boolean } | null | undefined,
  request: Record<string, unknown>, task?: ArcModelTask) {
  const selection = arcRequestSelection(request);
  const isAdmin = selection === ARC_ASTRA && !!user && !user.is_anonymous
    ? await isArcModelAdmin(db, user.id) : false;
  let hasBoost: boolean | undefined;
  if (selection === ARC_ASTRA && user && !user.is_anonymous) {
    if (isAdmin) hasBoost = true;
    else {
      const access = await db.rpc('user_has_boost', { check_user_id: user.id });
      if (access.error) throw new ArcModelAccessError('Model access could not be verified. Please try again.', 503);
      hasBoost = access.data === true;
    }
  }
  return { ...resolveArcModelRoute({ selection, task: task ?? arcRequestTask(request),
    complexity: arcRequestComplexity(request), isAdmin, hasBoost }), isAdmin, hasBoost };
}
