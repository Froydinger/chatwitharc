import {
  cloudScheduledStore,
  cloudScheduledTools,
  validateCloudScheduledCall,
} from "./cloudScheduledTools.ts";
import { initialEngineState } from "./cloudRunEngine.ts";
import type { ToolCall } from "./cloudRunEngine.ts";
import type { ClaimedCloudRun } from "./cloudRunWorker.ts";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function fixture(mode: "ask" | "auto" = "auto") {
  const call: ToolCall = {
    id: "schedule-1",
    name: "schedule_task",
    arguments: JSON.stringify({
      title: "Reminder",
      prompt: "Check plants",
      when_iso: "2099-01-01T12:00:00Z",
    }),
  };
  const engine = initialEngineState([], Date.now());
  engine.turns = 1;
  engine.calls = [call];
  const run: ClaimedCloudRun = {
    id: id(1),
    user_id: id(2),
    session_id: id(3),
    lease_token: id(4),
    mode,
    created_at: new Date().toISOString(),
    request: { messages: [] },
    checkpoint: { engine },
  };
  return { run, call, key: `${run.id}:turn:1:tool:${call.id}` };
}
for (const mode of ["ask", "auto"] as const) {
  Deno.test(`${mode}: owner/policy rechecked; receipt/fence exact; no provider`, async () => {
    const { run, call, key } = fixture(mode);
    let owner = true, policy = true, writes = 0;
    const store = cloudScheduledStore({
      rpc: async (name, args) => {
        assert(name === "cloud_scheduled_step");
        assert(
          args.p_user_id === run.user_id &&
            args.p_lease_token === run.lease_token,
        );
        assert(args.p_call === call && args.p_receipt_key === key);
        writes++;
        return {
          error: null,
          data: {
            status: "done",
            receipt_key: key,
            run_id: run.id,
            user_id: run.user_id,
            call,
            result: { performed: true, task_id: id(5) },
          },
        };
      },
    });
    const tools = cloudScheduledTools({
      store,
      authorizeOwner: async () => owner,
      authorizeSchedule: async () => policy,
    });
    assert(
      tools.schedule_task.approval === "ask-mode" &&
        tools.schedule_task.replaySafe,
    );
    assert(await tools.schedule_task.authorize(run, call));
    assert(
      JSON.parse(await tools.schedule_task.execute(run, call, key) as string)
        .performed,
    );
    owner = false;
    await tools.schedule_task.execute(run, call, key);
    assert(writes === 1);
    owner = true;
    policy = false;
    await tools.schedule_task.execute(run, call, key);
    assert(writes === 1);
  });
}
Deno.test("invalid receipt identities and ambiguous RPC throw, permitting same-key replay only", async () => {
  const { run, call, key } = fixture();
  for (
    const data of [null, { status: "done", user_id: id(99), result: {} }, {
      status: "unknown",
    }]
  ) {
    const tool = cloudScheduledTools({
      store: cloudScheduledStore({
        rpc: async () => ({ error: null, data }),
      }),
      authorizeOwner: async () => true,
      authorizeSchedule: async () => true,
    }).schedule_task;
    let threw = false;
    try {
      await tool.execute(run, call, key);
    } catch {
      threw = true;
    }
    assert(threw);
  }
});
Deno.test("fenced and unapproved results cannot claim performed", async () => {
  const { run, call, key } = fixture("ask");
  for (const status of ["fenced", "approval_required"] as const) {
    const tool = cloudScheduledTools({
      store: { apply: async () => ({ status }) },
      authorizeOwner: async () => true,
      authorizeSchedule: async () => true,
    }).schedule_task;
    assert(
      JSON.parse(await tool.execute(run, call, key) as string).performed ===
        false,
    );
  }
});
Deno.test("missing exact receipt key or lease never reaches persistence", async () => {
  const { run, call, key } = fixture();
  let writes = 0;
  const tool = cloudScheduledTools({
    store: {
      apply: async () => {
        writes++;
        return { status: "fenced" };
      },
    },
    authorizeOwner: async () => true,
    authorizeSchedule: async () => true,
  }).schedule_task;
  await tool.execute(run, call, key + "x");
  run.lease_token = "";
  await tool.execute(run, call, key);
  assert(writes === 0);
});
Deno.test("update requires captured id/version and rejects owner overrides, latest selectors and mixed cancel edits", () => {
  for (
    const args of [{ title: "new" }, { task_id: id(5), title: "new" }, {
      task_id: "latest",
      expected_version: "a".repeat(64),
      title: "new",
    }, {
      task_id: id(5),
      expected_version: "a".repeat(64),
      cancel: true,
      title: "new",
    }, {
      task_id: id(5),
      expected_version: "a".repeat(64),
      title: "new",
      user_id: id(9),
    }]
  ) {
    let threw = false;
    try {
      validateCloudScheduledCall({
        id: "x",
        name: "update_scheduled_task",
        arguments: JSON.stringify(args),
      });
    } catch {
      threw = true;
    }
    assert(threw);
  }
  validateCloudScheduledCall({
    id: "x",
    name: "update_scheduled_task",
    arguments: JSON.stringify({
      task_id: id(5),
      expected_version: "a".repeat(64),
      cancel: true,
    }),
  });
});
Deno.test("read latest is owner-only and never asks mutation approval", async () => {
  const { run } = fixture();
  const call = {
    id: "read",
    name: "get_scheduled_task",
    arguments: '{"task_id":null}',
  };
  const tools = cloudScheduledTools({
    store: { apply: async () => ({ status: "fenced" }) },
    authorizeOwner: async () => true,
    authorizeSchedule: async () => {
      throw new Error("Must not require mutation policy to read");
    },
  });
  assert(tools.get_scheduled_task.approval === "never");
  assert(await tools.get_scheduled_task.authorize(run, call));
});
Deno.test("schedule bounds and explicit UTC contract", () => {
  for (
    const args of [
      { title: "x", prompt: "y" },
      { title: "x", prompt: "y", when_iso: "tomorrow" },
      {
        title: "x",
        prompt: "y",
        when_iso: "2099-01-01T00:00:00Z",
        cron_expr: "* * * * *",
      },
      { title: "x".repeat(201), prompt: "y", cron_expr: "* * * * *" },
      {
        title: "x",
        prompt: "y",
        cron_expr: "* * * * *",
        result_chat_id: id(8),
      },
    ]
  ) {
    let threw = false;
    try {
      validateCloudScheduledCall({
        id: "x",
        name: "schedule_task",
        arguments: JSON.stringify(args),
      });
    } catch {
      threw = true;
    }
    assert(threw);
  }
});
