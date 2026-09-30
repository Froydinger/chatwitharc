export type BurstState = { status: string; waitingForModel: boolean };
/** Reclaim after EVERY saved boundary. Duplicate wakes lose the fenced claim,
 * and stop immediately. Never retry failed/ambiguous provider operations here. */
export async function continueCloudRun(id: string, ports: {
  advance(id: string): Promise<boolean>;
  inspect(id: string): Promise<BurstState | null>;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  durationMs?: number;
  maxSteps?: number;
}) {
  const now = ports.now ?? Date.now;
  const wait = ports.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const started = now();
  const deadline = started + (ports.durationMs ?? 20_000);
  let steps = 0;
  let queued = false;
  while (steps < (ports.maxSteps ?? 32) && now() < deadline) {
    if (!await ports.advance(id)) return { steps, requeue: false, elapsedMs: now() - started };
    steps++;
    const state = await ports.inspect(id);
    queued = state?.status === 'queued';
    if (!queued) return { steps, requeue: false, elapsedMs: now() - started };
    if (state!.waitingForModel) await wait(Math.min(750, Math.max(0, deadline - now())));
  }
  return { steps, requeue: queued, elapsedMs: now() - started };
}
