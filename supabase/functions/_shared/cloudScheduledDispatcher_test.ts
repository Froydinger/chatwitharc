import {
  cloudScheduledDispatcher,
  type Occurrence,
  type ScheduledDispatchStore,
} from "./cloudScheduledDispatcher.ts";
function assert(v: unknown) {
  if (!v) throw new Error("Assertion failed");
}
function fixture(state: Occurrence["state"] = "ready") {
  const o: Occurrence = {
    id: "occ",
    user_id: "owner",
    task_id: "task",
    lease_token: "fence",
    state,
    provider_id: "provider-1",
    snapshot: { title: "Title", prompt: "Prompt" },
  };
  const steps: string[] = [], effects: string[] = [];
  let save = true;
  const store: ScheduledDispatchStore = {
    claim: async () => o,
    step: async (_o, a) => {
      steps.push(a);
      return save;
    },
    claimDelivery: async () => ({
      id: "delivery",
      user_id: "owner",
      lease_token: "fence",
      channel: "push",
      title: "t",
      body: "b",
      chat_id: "chat",
      idempotency_key: "scheduled:occ:push",
    }),
    finishDelivery: async () => {
      steps.push("sent");
      return save;
    },
  };
  const ports = {
    store,
    authorizeOwner: async () => true,
    model: {
      start: async () => {
        effects.push("start");
        return { id: "provider-1" };
      },
      poll: async () => {
        effects.push("poll");
        return { status: "completed" as const, text: "output" };
      },
    },
    deliver: async () => {
      effects.push("send");
      return { accepted: true as const, id: "receipt" };
    },
  };
  return {
    ports,
    steps,
    effects,
    denySave() {
      save = false;
    },
  };
}
Deno.test("start intent precedes provider; acceptance is persisted then yielded", async () => {
  const f = fixture();
  await cloudScheduledDispatcher(f.ports).tick();
  assert(f.steps.join(",") === "start,accept,yield");
});
Deno.test("false fence save prevents provider start", async () => {
  const f = fixture();
  f.denySave();
  await cloudScheduledDispatcher(f.ports).tick();
  assert(f.effects.length === 0);
});
Deno.test("ambiguous provider acceptance leaves intent, no second start within tick", async () => {
  const f = fixture();
  f.ports.model.start = async () => {
    throw Error("network");
  };
  try {
    await cloudScheduledDispatcher(f.ports).tick();
  } catch {}
  assert(f.steps.join(",") === "start");
});
Deno.test("accepted work polls then saves result before atomic completion", async () => {
  const f = fixture("accepted");
  await cloudScheduledDispatcher(f.ports).tick();
  assert(f.effects.join(",") === "poll");
  assert(f.steps.join(",") === "result,complete");
});
Deno.test("saved result retries only completion, never provider", async () => {
  const f = fixture("result");
  await cloudScheduledDispatcher(f.ports).tick();
  assert(f.effects.length === 0);
  assert(f.steps.join(",") === "complete");
});
Deno.test("revoked owner prevents model and delivery", async () => {
  const f = fixture();
  f.ports.authorizeOwner = async () => false;
  const d = cloudScheduledDispatcher(f.ports);
  await d.tick();
  await d.deliveryTick();
  assert(f.effects.length === 0);
});
Deno.test("delivery receipt persisted only after accepted send", async () => {
  const f = fixture();
  await cloudScheduledDispatcher(f.ports).deliveryTick();
  assert(f.effects.join(",") === "send" && f.steps.join(",") === "sent");
});
Deno.test("ambiguous delivery never fabricates receipt", async () => {
  const f = fixture();
  f.ports.deliver = async () => {
    throw Error("network");
  };
  try {
    await cloudScheduledDispatcher(f.ports).deliveryTick();
  } catch {}
  assert(f.steps.length === 0);
});
