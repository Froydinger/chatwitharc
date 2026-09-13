import { deepStrictEqual, equal, rejects } from "node:assert/strict";
import { cloudWorkerStore } from "./cloudRunStore.ts";
import type { ClaimedCloudRun } from "./cloudRunWorker.ts";
import { processCloudRun } from "./cloudRunWorker.ts";
import { CLOUD_LIMITS, type EngineState } from "./cloudRunEngine.ts";

// Only the RPC transport is mocked. No Supabase client is instantiated and no
// network/database/provider is used. These tests verify adapter contracts, not
// the SQL implementation's fencing, row ownership or atomic append semantics.
type Client = Parameters<typeof cloudWorkerStore>[0];
type Reply = { data: unknown; error: unknown };
const copy = <T>(value: T): T => structuredClone(value);
const fixture = (): ClaimedCloudRun => ({
  id: "00000000-0000-4000-8000-000000000001",
  user_id: "00000000-0000-4000-8000-000000000002",
  session_id: "00000000-0000-4000-8000-000000000003",
  lease_token: "00000000-0000-4000-8000-000000000004",
  mode: "ask",
  created_at: "2026-09-12T12:00:00.000Z",
  session_sequence: 1,
  input_revision: 2,
  started_at: "2026-09-12T12:10:00.000Z",
  execution_messages: [{ role: "user", content: "Authoritative request" }],
  request: { messages: [{ role: "user", content: "Synthetic request" }] },
  checkpoint: { preserved: { step: 2 } },
});
const success = (data: unknown): Reply => ({ data, error: null });

for (
  const [field, values] of Object.entries({
    session_sequence: [undefined, 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, "1"],
    input_revision: [undefined, -1, 1.5, "1"],
    started_at: [undefined, null, "not-a-date"],
    execution_messages: [undefined, null, {}, [{
      role: "system",
      content: "forged",
    }], [{ role: "user", content: 123 }]],
  })
) {
  Deno.test(`cloud store: validates frozen claim ${field}`, async () => {
    for (const value of values) {
      const mock = new RpcMock([success([{ ...fixture(), [field]: value }])]);
      await rejects(
        () => cloudWorkerStore(mock.client).claim(fixture().id),
        /Invalid claimed run/,
      );
    }
  });
}

Deno.test("cloud store/worker: frozen transcript and first-start deadline override old submission", async () => {
  const row = fixture();
  row.created_at = "2020-01-01T00:00:00.000Z";
  const started = Date.parse(row.started_at!);
  const mock = new RpcMock([success([row])]);
  let state: EngineState | undefined;
  let providerInput: unknown;
  await processCloudRun(row.id, {
    now: () => started + 1000,
    store: {
      ...cloudWorkerStore(mock.client),
      checkpoint: async (_run, checkpoint) => {
        state = checkpoint.engine as EngineState;
        return true;
      },
    },
    tools: {},
    provider: {
      startModel: async (input) => {
        providerInput = input;
        return "response";
      },
      pollModel: async () => null,
      cancelModel: async () => {},
    },
  });
  deepStrictEqual(providerInput, row.execution_messages);
  equal(state?.deadline, started + CLOUD_LIMITS.durationMs);
});

class RpcMock {
  calls: { name: string; args: Record<string, unknown> }[] = [];
  replies: (Reply | Error)[];
  client: Client;
  constructor(replies: (Reply | Error)[]) {
    this.replies = [...replies];
    // The real client returns an awaitable PostgREST builder. A Promise has the
    // same await boundary here; the cast stays confined to this test double.
    this.client = {
      rpc: (name: string, args: Record<string, unknown>) => {
        this.calls.push({ name, args: copy(args) });
        const reply = this.replies.shift();
        if (!reply) return Promise.reject(new Error("Unexpected extra RPC"));
        if (reply instanceof Error) return Promise.reject(reply);
        return Promise.resolve(copy(reply));
      },
    } as unknown as Client;
  }
}

Deno.test("cloud store: claim sends stable request UUID and bounded lease duration", async () => {
  const row = fixture();
  const mock = new RpcMock([success([row])]);
  const store = cloudWorkerStore(mock.client);
  deepStrictEqual(await store.claim(row.id), row);
  deepStrictEqual(mock.calls, [{
    name: "claim_cloud_run",
    args: { p_run_id: row.id, p_lease_seconds: 300 },
  }]);
});

Deno.test("cloud store: empty or absent claim data means no acquired work", async () => {
  for (const data of [[], null, undefined]) {
    const mock = new RpcMock([success(data)]);
    equal(await cloudWorkerStore(mock.client).claim(fixture().id), null);
    equal(mock.calls.length, 1, "an empty claim must not trigger a retry");
  }
});

for (const field of ["lease_token", "user_id", "session_id"] as const) {
  Deno.test(`cloud store: claim rejects missing or empty ${field}`, async () => {
    for (const value of [undefined, null, ""]) {
      const row = { ...fixture(), [field]: value };
      const mock = new RpcMock([success([row])]);
      await rejects(
        () => cloudWorkerStore(mock.client).claim(fixture().id),
        /^Error: Invalid claimed run$/,
      );
      equal(mock.calls.length, 1);
    }
  });

  Deno.test(`cloud store: claim rejects a truthy non-string ${field}`, async () => {
    const mock = new RpcMock([success([{ ...fixture(), [field]: 42 }])]);
    await rejects(
      () => cloudWorkerStore(mock.client).claim(fixture().id),
      /^Error: Invalid claimed run$/,
    );
    equal(mock.calls.length, 1);
  });
}

Deno.test("cloud store: claim rejects a different run ID without following that row", async () => {
  const mock = new RpcMock([
    success([{ ...fixture(), id: "00000000-0000-4000-8000-000000000099" }]),
  ]);
  await rejects(
    () => cloudWorkerStore(mock.client).claim(fixture().id),
    /^Error: Invalid claimed run$/,
  );
  equal(mock.calls.length, 1);
});

Deno.test("cloud store: null row is rejected as a controlled invalid claim", async () => {
  const mock = new RpcMock([success([null])]);
  await rejects(
    () => cloudWorkerStore(mock.client).claim(fixture().id),
    /^Error: Invalid claimed run$/,
  );
});

Deno.test("cloud store: claim returns the server owner, session and checkpoint unchanged", async () => {
  const row = {
    ...fixture(),
    mode: "auto" as const,
    checkpoint: { inputResponse: { text: "continue" }, extra: [1, 2] },
  };
  const before = copy(row);
  const mock = new RpcMock([success([row])]);
  const claimed = await cloudWorkerStore(mock.client).claim(row.id);
  deepStrictEqual(claimed, before);
  deepStrictEqual(row, before);
  equal(claimed?.user_id, row.user_id);
  equal(claimed?.session_id, row.session_id);
});

for (
  const status of ["running", "queued", "awaiting_input", "failed", "cancelled"]
) {
  Deno.test(`cloud store: ${status} checkpoint carries the exact lease fence and status`, async () => {
    const run = fixture();
    const checkpoint = {
      provider: { responseId: "synthetic-response", polls: 12 },
      inputResponse: { decision: "approve", callId: "synthetic-call" },
      lease_token: "nested-value-must-not-replace-the-fence",
    };
    const before = copy({ run, checkpoint });
    const mock = new RpcMock([success(true)]);
    const result = await cloudWorkerStore(mock.client).checkpoint(
      run,
      checkpoint,
      status,
      "Synthetic reason",
    );
    equal(result, true);
    deepStrictEqual(mock.calls, [{
      name: "checkpoint_cloud_run",
      args: {
        p_run_id: run.id,
        p_lease_token: run.lease_token,
        p_checkpoint: checkpoint,
        p_status: status,
        p_lease_seconds: 300,
        p_error: "Synthetic reason",
      },
    }]);
    deepStrictEqual(
      { run, checkpoint },
      before,
      "transport must not mutate its inputs",
    );
  });
}

Deno.test("cloud store: omitted checkpoint reason becomes SQL null while empty text is preserved", async () => {
  for (const reason of [undefined, ""]) {
    const mock = new RpcMock([success(true)]);
    await cloudWorkerStore(mock.client).checkpoint(
      fixture(),
      {},
      "queued",
      reason,
    );
    equal(mock.calls[0].args.p_error, reason ?? null);
  }
});

for (const operation of ["checkpoint", "complete"] as const) {
  Deno.test(`cloud store: ${operation} accepts only literal true, never truthy RPC results`, async () => {
    for (
      const data of [true, false, null, undefined, 0, 1, "true", [], [true], {
        success: true,
      }]
    ) {
      const mock = new RpcMock([success(data)]);
      const store = cloudWorkerStore(mock.client);
      const result = operation === "checkpoint"
        ? await store.checkpoint(fixture(), {}, "queued")
        : await store.complete(fixture(), { text: "answer" }, {
          id: "synthetic-message",
        });
      equal(result, data === true);
      equal(
        mock.calls.length,
        1,
        "fence rejection must not be retried without a new claim",
      );
    }
  });
}

Deno.test("cloud store: completion transports result and stable assistant append in one RPC", async () => {
  const run = fixture();
  const result = {
    choices: [{ message: { role: "assistant", content: "Saved answer" } }],
    model_used: "gpt-5.6-luna",
    cloud_run_id: run.id,
    p_run_id: "nested-result-must-not-replace-the-target",
  };
  const message = {
    id: `cloud-${run.id}`,
    role: "assistant",
    content: "Saved answer",
    timestamp: run.created_at,
    metadata: { cloudRunId: run.id, model: "gpt-5.6-luna" },
  };
  const before = copy({ run, result, message });
  const mock = new RpcMock([success(true)]);
  equal(
    await cloudWorkerStore(mock.client).complete(run, result, message),
    true,
  );
  deepStrictEqual(mock.calls, [{
    name: "complete_cloud_run",
    args: {
      p_run_id: run.id,
      p_lease_token: run.lease_token,
      p_result: result,
      p_assistant_message: message,
    },
  }]);
  deepStrictEqual({ run, result, message }, before);
  // Mock exposes only rpc: any client-side chat read/update would fail the test.
  equal(mock.calls.length, 1);
});

Deno.test("cloud store: resumed completion uses its fresh fence and preserves the original message ID", async () => {
  const oldRun = fixture();
  const newRun = {
    ...fixture(),
    lease_token: "00000000-0000-4000-8000-000000000005",
  };
  const message = {
    id: `cloud-${oldRun.id}`,
    role: "assistant",
    content: "Same durable answer",
  };
  const result = { content: "Same durable answer" };
  const mock = new RpcMock([success(false), success(true)]);
  const store = cloudWorkerStore(mock.client);
  equal(await store.complete(oldRun, result, message), false);
  equal(await store.complete(newRun, result, message), true);
  deepStrictEqual(mock.calls.map((call) => call.args.p_lease_token), [
    oldRun.lease_token,
    newRun.lease_token,
  ]);
  deepStrictEqual(mock.calls.map((call) => call.args.p_run_id), [
    oldRun.id,
    oldRun.id,
  ]);
  deepStrictEqual(
    mock.calls[0].args.p_assistant_message,
    mock.calls[1].args.p_assistant_message,
  );
  deepStrictEqual(mock.calls[0].args.p_result, mock.calls[1].args.p_result);
});

Deno.test("cloud store: two claimed owners retain separate fences without cached user state", async () => {
  const first = fixture();
  const second: ClaimedCloudRun = {
    ...fixture(),
    id: "00000000-0000-4000-8000-000000000011",
    user_id: "00000000-0000-4000-8000-000000000012",
    session_id: "00000000-0000-4000-8000-000000000013",
    lease_token: "00000000-0000-4000-8000-000000000014",
  };
  const mock = new RpcMock([
    success([first]),
    success([second]),
    success(true),
    success(true),
  ]);
  const store = cloudWorkerStore(mock.client);
  const a = await store.claim(first.id);
  const b = await store.claim(second.id);
  if (!a || !b) throw new Error("Fixture claim failed");
  await store.checkpoint(a, {}, "queued");
  await store.complete(b, {}, { id: `cloud-${b.id}`, role: "assistant" });
  deepStrictEqual(
    mock.calls.slice(2).map((
      call,
    ) => [call.args.p_run_id, call.args.p_lease_token]),
    [
      [first.id, first.lease_token],
      [second.id, second.lease_token],
    ],
  );
  equal(a.user_id, first.user_id);
  equal(b.user_id, second.user_id);
});

for (const operation of ["claim", "checkpoint", "complete"] as const) {
  Deno.test(`cloud store: ${operation} RPC error overrides data and hides database details`, async () => {
    const data = operation === "claim" ? [fixture()] : true;
    const mock = new RpcMock([{
      data,
      error: {
        message: "Synthetic internal detail",
        details: "not for callers",
      },
    }]);
    const store = cloudWorkerStore(mock.client);
    const invoke = () =>
      operation === "claim"
        ? store.claim(fixture().id)
        : operation === "checkpoint"
        ? store.checkpoint(fixture(), {}, "queued")
        : store.complete(fixture(), {}, {});
    await rejects(
      invoke,
      new RegExp(`^Error: Unable to ${operation} cloud run$`),
    );
    equal(mock.calls.length, 1);
  });

  Deno.test(`cloud store: ${operation} transport rejection is surfaced without automatic retry`, async () => {
    const mock = new RpcMock([new Error("Synthetic transport failure")]);
    const store = cloudWorkerStore(mock.client);
    const invoke = () =>
      operation === "claim"
        ? store.claim(fixture().id)
        : operation === "checkpoint"
        ? store.checkpoint(fixture(), {}, "queued")
        : store.complete(fixture(), {}, {});
    await rejects(invoke);
    equal(mock.calls.length, 1);
  });
}
