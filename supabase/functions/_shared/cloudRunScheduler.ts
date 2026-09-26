import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

export const CLOUD_SWEEP_LIMIT = 4;
type SweepPorts = {
  candidates(now: string, limit: number): Promise<string[]>;
  advance(id: string): Promise<boolean>;
};

/** Restrict production diagnostics to stable identifiers and allowlisted fields.
 * Error messages may contain provider responses, user content, or secrets. */
export function cloudFailureLogFields(error: unknown) {
  const value = error && typeof error === "object"
    ? error as Record<string, unknown>
    : {};
  const errorName = typeof value.name === "string" &&
      /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value.name)
    ? value.name
    : "Error";
  const safeCode = typeof value.safeCode === "string" &&
      /^[A-Z0-9_]{1,16}$/.test(value.safeCode)
    ? value.safeCode
    : undefined;
  const safeAction = typeof value.safeAction === "string" && [
    "open",
    "apply",
    "complete",
    "publish_start",
    "publish_commit",
    "publish_abort",
  ].includes(value.safeAction)
    ? value.safeAction
    : undefined;
  return {
    errorName,
    ...(safeCode ? { dbCode: safeCode } : {}),
    ...(safeAction ? { action: safeAction } : {}),
  };
}

/** Scheduler-owned wakeup, independent of any browser. Candidate selection is
 * advisory; each advance MUST atomically claim a fenced lease before working.
 * One bounded parallel batch keeps a stalled run from starving the whole queue.
 * No automatic paid POST retry: recovery uses the persisted engine state. */
export async function sweepCloudRuns(ports: SweepPorts, now = new Date()) {
  const ids = [
    ...new Set(await ports.candidates(now.toISOString(), CLOUD_SWEEP_LIMIT)),
  ]
    .slice(0, CLOUD_SWEEP_LIMIT);
  const results = await Promise.allSettled(ids.map((id) => ports.advance(id)));
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("Cloud run advance failed", {
        runId: ids[index],
        ...cloudFailureLogFields(result.reason),
      });
    }
  });
  return {
    examined: ids.length,
    advanced:
      results.filter((result) => result.status === "fulfilled" && result.value)
        .length,
    skipped:
      results.filter((result) => result.status === "fulfilled" && !result.value)
        .length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}

/** Database clock and one eligible head per session. Claims atomically
 * revalidate eligibility; paused followers cannot crowd out unrelated chats. */
export function cloudRunCandidates(db: Pick<SupabaseClient, "rpc">) {
  return async (_now: string, limit: number): Promise<string[]> => {
    const bounded = Number.isFinite(limit)
      ? Math.min(CLOUD_SWEEP_LIMIT, Math.max(1, Math.floor(limit)))
      : CLOUD_SWEEP_LIMIT;
    const { data, error } = await db.rpc("list_claimable_cloud_runs", {
      p_limit: bounded,
    });
    if (error) throw new Error("Unable to select cloud runs");
    if (!Array.isArray(data)) throw new Error("Invalid cloud run candidates");
    if (data.length > bounded) throw new Error("Invalid cloud run candidates");
    const sessions = new Set<string>();
    return data.map((row) => {
      const uuid = (value: unknown) =>
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        );
      if (
        !row || !uuid(row.id) || !uuid(row.session_id) ||
        sessions.has(row.session_id)
      ) {
        throw new Error("Invalid cloud run candidate");
      }
      sessions.add(row.session_id);
      return row.id;
    });
  };
}
