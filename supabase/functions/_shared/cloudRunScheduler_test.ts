import { deepStrictEqual, equal, rejects } from "node:assert/strict";
import { cloudRunCandidates, sweepCloudRuns } from "./cloudRunScheduler.ts";

Deno.test("cloud sweep: empty queue does not execute or call a provider", async () => {
  const result = await sweepCloudRuns({
    candidates: () => Promise.resolve([]),
    advance: () => {
      throw new Error("unexpected");
    },
  });
  deepStrictEqual(result, { examined: 0, advanced: 0, skipped: 0, failed: 0 });
});

Deno.test("cloud sweep: bounded unique parallel work isolates failures and lost claims", async () => {
  const calls: string[] = [];
  const result = await sweepCloudRuns({
    candidates: () => Promise.resolve(["a", "a", "b", "c", "d", "e"]),
    advance: async (id) => {
      calls.push(id);
      if (id === "a") {
        throw new Error("sensitive upstream response must not escape");
      }
      return id !== "b";
    },
  });
  deepStrictEqual(calls, ["a", "b", "c", "d"]);
  deepStrictEqual(result, { examined: 4, advanced: 2, skipped: 1, failed: 1 });
});

Deno.test("cloud sweep: failed candidate query launches no work", async () => {
  await rejects(
    () =>
      sweepCloudRuns({
        candidates: () => Promise.reject(new Error("query failed")),
        advance: () => {
          throw new Error("unexpected advance");
        },
      }),
    /query failed/,
  );
});

Deno.test("cloud sweep: server RPC selects only eligible session heads with bounded limit", async () => {
  const steps: unknown[] = [];
  const db = {
    rpc(name: string, args: unknown) {
      steps.push([name, args]);
      return Promise.resolve({
        data: [{
          id: "00000000-0000-4000-8000-000000000001",
          session_id: "00000000-0000-4000-8000-000000000002",
        }],
        error: null,
      });
    },
  };
  const select = cloudRunCandidates(
    db as unknown as Parameters<typeof cloudRunCandidates>[0],
  );
  const now = "2026-09-12T12:00:00.000Z";
  deepStrictEqual(await select(now, 100), [
    "00000000-0000-4000-8000-000000000001",
  ]);
  deepStrictEqual(steps, [["list_claimable_cloud_runs", { p_limit: 4 }]]);
});

Deno.test("cloud sweep: duplicate-session and malformed RPC rows are rejected", async () => {
  const row = {
    id: "00000000-0000-4000-8000-000000000001",
    session_id: "00000000-0000-4000-8000-000000000002",
  };
  for (
    const data of [[row, row], [{ ...row, session_id: "bad" }], [null], null]
  ) {
    const db = { rpc: () => Promise.resolve({ data, error: null }) };
    await rejects(
      () =>
        cloudRunCandidates(
          db as unknown as Parameters<typeof cloudRunCandidates>[0],
        )("", 4),
      /Invalid cloud run candidate/,
    );
  }
});
