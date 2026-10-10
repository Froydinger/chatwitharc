import { ARC_SOL, ARC_LUNA, arcRequestSelection, arcRequestTask, arcRequestComplexity, resolveArcModelRoute, type ArcTextModel } from './arcModelRouting.ts';
export type DurableEffort = 'none' | 'low' | 'medium' | 'high';
export function workModelRoute(request: Record<string, unknown>, _effort: DurableEffort, hasBoost: boolean, gitEnabled: boolean, isAdmin = false) {
  if (request.gitModelMode !== undefined && !['normal', 'pro'].includes(String(request.gitModelMode))) throw new Error('Invalid Git model mode');
  if (request.gitModelMode === 'pro') {
    if (request.forceGit !== true || !gitEnabled) throw new Error('Git Pro requires an enabled Git run');
    if (!hasBoost) throw new Error('Git Pro requires ArcAI Boost');
  }
  const selection = arcRequestSelection(request);
  return resolveArcModelRoute({
    selection: selection === 'auto' && request.gitModelMode === 'pro' ? ARC_SOL : selection,
    task: arcRequestTask(request), complexity: arcRequestComplexity(request), hasBoost, isAdmin,
  });
}
// App Builder retains its separate Fast/Pro selector and current Boost gate.
// Arbitrary request.model values never enter the builder provider.
export function appModelRoute(request: Record<string, unknown>): { model: ArcTextModel; effort: 'low' } {
  if (request.appModelMode !== undefined && !['fast', 'pro'].includes(String(request.appModelMode))) throw new Error('Invalid App model mode');
  return { model: request.appModelMode === 'pro' ? ARC_SOL : ARC_LUNA, effort: 'low' as const };
}
