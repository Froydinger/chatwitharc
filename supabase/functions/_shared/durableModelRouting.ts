export type DurableEffort = 'none' | 'low' | 'medium' | 'high';
export function workModelRoute(request: Record<string, unknown>, effort: DurableEffort, hasBoost: boolean, gitEnabled: boolean) {
  if (request.gitModelMode !== undefined && !['normal', 'pro'].includes(String(request.gitModelMode))) throw new Error('Invalid Git model mode');
  if (request.gitModelMode === 'pro') {
    if (request.forceGit !== true || !gitEnabled) throw new Error('Git Pro requires an enabled Git run');
    if (!hasBoost) throw new Error('Git Pro requires ArcAI Boost');
    return { model: 'gpt-6.1-sol' as const, effort: 'low' as DurableEffort };
  }
  if (effort === 'high' && !hasBoost) throw new Error('This model requires ArcAI Boost');
  return { model: effort === 'high' ? 'gpt-6.1-sol' as const : 'gpt-6-luna' as const, effort: effort === 'high' ? 'low' as DurableEffort : effort };
}
// App entitlement is revalidated by the caller before every lease/provider action.
export function appModelRoute(request: Record<string, unknown>) {
  if (request.appModelMode !== undefined && !['fast', 'pro'].includes(String(request.appModelMode))) throw new Error('Invalid App model mode');
  return { model: request.appModelMode === 'pro' ? 'gpt-6.1-sol' as const : 'gpt-6-luna' as const, effort: 'low' as const };
}
