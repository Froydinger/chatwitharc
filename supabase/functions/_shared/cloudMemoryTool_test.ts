import { deepStrictEqual, equal, ok } from "node:assert/strict";
import {
  cleanMemorySummary,
  type CloudMemoryStore,
  cloudMemoryStore,
  cloudMemoryTool,
  legacyMemoryChunks,
  type MemoryStepResult,
  type MemorySynthesis,
} from "./cloudMemoryTool.ts";
import { initialEngineState } from "./cloudRunEngine.ts";
import { cloudPresentation, cloudMessagePresentation } from "./cloudRunArtifacts.ts";
import {
  type ClaimedCloudRun,
  cloudCallHash,
  processCloudRun,
} from "./cloudRunWorker.ts";

function fixture(mode: "ask" | "auto" = "auto") {
  const call = {
    id: "call-1",
    name: "save_memory",
    arguments: JSON.stringify({
      memory: "Jake uses a new phone",
      replaces: ["old phone"],
    }),
  };
  const engine = initialEngineState([], Date.now());
  engine.phase = "tools";
  engine.turns = 1;
  engine.calls = [call];
  const run: ClaimedCloudRun = {
    id: "run",
    user_id: "owner",
    session_id: "session",
    lease_token: "lease",
    mode,
    created_at: new Date().toISOString(),
    request: { messages: [] },
    checkpoint: { engine },
  };
  const key = "run:turn:1:tool:call-1";
  let receipt: MemoryStepResult = {
    status: "ready",
    receipt_key: key,
    run_id: run.id,
    user_id: run.user_id,
    call,
    snapshot: {
      summary: "old phone; unrelated fact",
      revision: 3,
      migrated_from_legacy: true,
    },
    legacy: [],
    step: 0,
    draft: "old phone; unrelated fact",
  };
  const requests: MemorySynthesis[] = [], steps: string[] = [];
  let owner = true,
    authorized = true,
    ambiguous = false,
    saveLost = false,
    commitLost = false,
    fenced = false,
    conflict = false;
  const store: CloudMemoryStore = {
    step: async (_run, _call, _key, action, step = 0, summary) => {
      steps.push(action);
      if (fenced) return { status: "fenced" };
      if (action === "begin") return structuredClone(receipt);
      if (action === "start") {
        if (receipt.status !== "ready" || receipt.step !== step) {
          return { status: "recovery_required" };
        }
        receipt.status = "started";
        return { status: "started" };
      }
      if (action === "save") {
        if (saveLost) throw new Error("synthetic save network error");
        receipt = {
          ...receipt,
          status: "ready",
          step: step + 1,
          draft: summary,
        };
        return { status: "ready" };
      }
      if (conflict) {
        receipt.status = "conflict";
        return { status: "conflict" };
      }
      receipt = {
        ...receipt,
        status: "done",
        result: { saved: true, revision: 4 },
      };
      if (commitLost) throw new Error("synthetic commit reply lost");
      return structuredClone(receipt);
    },
  };
  const tool = cloudMemoryTool({
    store,
    authorizeOwner: async () => owner,
    authorizeMemory: async () => authorized,
    synthesize: async (req) => {
      requests.push(req);
      if (ambiguous) {
        throw new Error("synthetic provider accepted but reply lost");
      }
      return "new phone; unrelated fact";
    },
  });
  return {
    call,
    run,
    key,
    tool,
    requests,
    steps,
    store,
    get receipt() {
      return receipt;
    },
    set receipt(v) {
      receipt = v;
    },
    set owner(v: boolean) {
      owner = v;
    },
    set authorized(v: boolean) {
      authorized = v;
    },
    set ambiguous(v: boolean) {
      ambiguous = v;
    },
    set saveLost(v: boolean) {
      saveLost = v;
    },
    set commitLost(v: boolean) {
      commitLost = v;
    },
    set fenced(v: boolean) {
      fenced = v;
    },
    set conflict(v: boolean) {
      conflict = v;
    },
    execute: () => tool.execute(run, call, key),
  };
}
async function output(f: ReturnType<typeof fixture>) {
  const value = await f.execute();
  return JSON.parse(typeof value === 'string' ? value : value.output);
}

Deno.test('memory: confirmed save and replay preserve the saved-memory badge', async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    const result = await f.execute();
    if (typeof result === 'string') throw new Error('Missing confirmed presentation');
    const receipts = JSON.parse(JSON.stringify({ saved: { state: 'done', presentation: result.presentation } }));
    deepStrictEqual(cloudMessagePresentation(cloudPresentation(receipts)), {
      type: 'text', memoryAction: { type: 'context_saved', content: 'Jake uses a new phone' },
    });
  }
  equal(f.requests.length, 1);
});
Deno.test('memory: uncertain and conflicting outcomes never show a saved badge', async () => {
  for (const failure of ['ambiguous', 'conflict'] as const) {
    const f = fixture(); f[failure] = true;
    equal(typeof await f.execute(), 'string');
  }
});
Deno.test("memory: living semantics, correction hints, limits and receipt replay", async () => {
  const f = fixture();
  equal((await output(f)).saved, true);
  equal((await output(f)).saved, true);
  equal(f.requests.length, 1);
  ok(f.requests[0].input.includes("unrelated fact"));
  ok(
    f.requests[0].input.includes(
      "EXPLICIT FACTS TO REPLACE OR CORRECT:\n- old phone",
    ),
  );
  equal(f.requests[0].reasoningEffort, "low");
  equal(f.requests[0].maxOutputTokens, 4000);
  equal(
    cleanMemorySummary("```text\nSummary: useful fact\n```"),
    "useful fact",
  );
  equal(cleanMemorySummary("EMPTY."), "");
  deepStrictEqual(legacyMemoryChunks([" fact ", "FACT", "other"]), [
    "- fact\n- other",
  ]);
});
for (const failure of ["ambiguous", "saveLost"] as const) {
  Deno.test(`memory: ${failure} never repeats paid synthesis`, async () => {
    const f = fixture();
    f[failure] = true;
    equal((await output(f)).status, "recovery_required");
    f[failure] = false;
    equal((await output(f)).status, "recovery_required");
    equal(f.requests.length, 1);
  });
}
Deno.test("memory: lost commit response resolves from saved receipt without synthesis", async () => {
  const f = fixture();
  f.commitLost = true;
  equal((await output(f)).status, "recovery_required");
  equal((await output(f)).saved, true);
  equal(f.requests.length, 1);
});
Deno.test("memory: saved legacy stage resumes without repeating previous synthesis", async () => {
  const f = fixture();
  f.receipt = {
    ...f.receipt,
    snapshot: null,
    legacy: ["old fact"],
    step: 1,
    draft: "already migrated fact",
  };
  equal((await output(f)).saved, true);
  equal(f.requests.length, 1);
  ok(f.requests[0].input.includes("already migrated fact"));
});
Deno.test("memory: legacy chunks synthesized in order then final save", async () => {
  const f = fixture();
  f.receipt = {
    ...f.receipt,
    snapshot: null,
    legacy: ["A".repeat(9000), "B".repeat(9000)],
    draft: "",
  };
  equal((await output(f)).saved, true);
  equal(f.requests.length, 3);
  ok(f.requests[0].input.includes("LEGACY MEMORY DATA"));
  ok(f.requests[2].input.includes("USER MEMORY OPERATION"));
});
for (const failure of ["owner", "authorized"] as const) {
  Deno.test(`memory: rejects ${failure} before all persistence/provider calls`, async () => {
    const f = fixture();
    f[failure] = false;
    equal((await output(f)).status, "not_authorized");
    equal(f.requests.length, 0);
    equal(f.steps.length, 0);
  });
}
Deno.test("memory: fenced claim prevents synthesis; wrong key rejected", async () => {
  const f = fixture();
  f.fenced = true;
  equal((await output(f)).status, "fenced");
  equal(f.requests.length, 0);
  equal(
    JSON.parse(await f.tool.execute(f.run, f.call, "other-key") as string)
      .status,
    "invalid_claim",
  );
});
Deno.test("memory: snapshot conflict does not resynthesize or claim success", async () => {
  const f = fixture();
  f.conflict = true;
  equal((await output(f)).status, "conflict");
  equal((await output(f)).status, "conflict");
  equal(f.requests.length, 1);
});
Deno.test("memory: reject forged owner receipt even when marked done", async () => {
  const f = fixture();
  f.receipt = {
    ...f.receipt,
    user_id: "other",
    status: "done",
    result: { saved: true, revision: 4 },
  };
  equal((await output(f)).status, "invalid_receipt");
  equal(f.requests.length, 0);
});
Deno.test("memory: reject argument ownership overrides and oversized change", async () => {
  const f = fixture();
  for (
    const args of [{ memory: "hello", user_id: "other" }, {
      memory: "x".repeat(8001),
    }, { memory: "", replaces: [] }]
  ) {
    const result = await f.tool.execute(f.run, {
      ...f.call,
      arguments: JSON.stringify(args),
    }, f.key);
    equal(JSON.parse(result as string).status, "invalid_arguments");
  }
  equal(f.requests.length, 0);
});
Deno.test("memory: RPC transport passes exact identity, fence and call key without JWT", async () => {
  const f = fixture();
  let sent: unknown;
  const store = cloudMemoryStore({
    rpc: async (name, args) => {
      sent = { name, args };
      return { data: { status: "fenced" }, error: null };
    },
  });
  await store.step(f.run, f.call, f.key, "start", 2);
  deepStrictEqual(sent, {
    name: "cloud_memory_step",
    args: {
      p_run_id: "run",
      p_user_id: "owner",
      p_lease_token: "lease",
      p_receipt_key: f.key,
      p_call: f.call,
      p_action: "start",
      p_step: 2,
      p_summary: null,
    },
  });
});
for (const mode of ["ask", "auto"] as const) {
  Deno.test(`memory: worker ${mode} approval policy`, async () => {
    const f = fixture(mode);
    let status = "";
    const options = {
      store: {
        claim: async () => f.run,
        checkpoint: async (
          _r: ClaimedCloudRun,
          c: ClaimedCloudRun["checkpoint"],
          s: string,
        ) => {
          f.run.checkpoint = c;
          status = s;
          return true;
        },
        complete: async () => true,
      },
      tools: { save_memory: f.tool },
      provider: {
        startModel: async () => {
          throw new Error("No model calls");
        },
        pollModel: async () => null,
        cancelModel: async () => {},
      },
    };
    await processCloudRun(f.run.id, options);
    if (mode === "ask") {
      equal(status, "awaiting_input");
      equal(f.requests.length, 0);
      const argumentsHash = await cloudCallHash(f.call);
      f.run.checkpoint.inputResponse = {
        callId: f.call.id,
        argumentsHash,
        decision: "approve",
      };
      await processCloudRun(f.run.id, options);
    }
    equal(f.requests.length, 1);
  });
}
