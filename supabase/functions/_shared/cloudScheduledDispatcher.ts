/** Server-only bounded ticks. No JWTs, browser lifetime, or legacy handler imports.
 * Release gate: disable legacy cron, wire authenticated server cron to these
 * ticks and supply provider/delivery ports with current owner authorization.
 * Delivery acceptance != user viewing. Unknown acceptance requires operator
 * reconciliation, not an automatic resend (push has no native idempotency).
 */
export type Occurrence = {
  id: string;
  user_id: string;
  task_id: string;
  lease_token: string;
  state: "ready" | "accepted" | "result";
  provider_id: string | null;
  snapshot: { title: string; prompt: string; [key: string]: unknown };
};
export type Delivery = {
  id: string;
  user_id: string;
  lease_token: string;
  channel: "push" | "email";
  title: string;
  body: string;
  chat_id: string;
  idempotency_key: string;
};
type Receipt = { accepted: true; id: string };
export interface ScheduledDispatchStore {
  claim(): Promise<Occurrence | null>;
  step(
    o: Occurrence,
    action: "start" | "accept" | "result" | "complete" | "yield" | "recover",
    value?: string,
  ): Promise<boolean>;
  claimDelivery(): Promise<Delivery | null>;
  finishDelivery(d: Delivery, receipt: Receipt): Promise<boolean>;
}
export function cloudScheduledDispatcher(ports: {
  store: ScheduledDispatchStore;
  authorizeOwner(userId: string): Promise<boolean>;
  model: {
    // Must return a recoverable server provider ID, not a fire-and-forget request.
    start(
      input: {
        ownerId: string;
        title: string;
        prompt: string;
        idempotencyKey: string;
      },
    ): Promise<{ id: string }>;
    poll(
      id: string,
      ownerId: string,
    ): Promise<
      { status: "pending" } | { status: "completed"; text: string } | {
        status: "failed";
      }
    >;
  };
  // Resolve recipients from ownerId server-side. Never accept a model-supplied
  // email/recipient. Adapter must honor idempotencyKey where provider supports it.
  deliver(input: Delivery): Promise<Receipt>;
}) {
  return {
    async tick(): Promise<boolean> {
      const o = await ports.store.claim();
      if (!o || !await ports.authorizeOwner(o.user_id)) return false;
      if (o.state === "ready") {
        if (!await ports.store.step(o, "start")) return false;
        if (!await ports.authorizeOwner(o.user_id)) return false;
        // A crash/timeout here leaves durable starting intent, never re-started.
        const accepted = await ports.model.start({
          ownerId: o.user_id,
          title: o.snapshot.title,
          prompt: o.snapshot.prompt,
          idempotencyKey: `scheduled:${o.id}:model`,
        });
        if (
          typeof accepted.id !== "string" || !accepted.id ||
          accepted.id.length > 300
        ) throw new Error("Unknown model acceptance");
        if (!await ports.store.step(o, "accept", accepted.id)) return false;
        return await ports.store.step(o, "yield");
      }
      if (o.state === "accepted") {
        if (!o.provider_id) throw new Error("Missing provider receipt");
        const response = await ports.model.poll(o.provider_id, o.user_id);
        if (!await ports.authorizeOwner(o.user_id)) return false;
        if (response.status === "pending") {
          return await ports.store.step(o, "yield");
        }
        if (response.status === "failed") {
          return await ports.store.step(o, "recover");
        }
        if (!response.text || response.text.length > 32000) {
          return await ports.store.step(o, "recover");
        }
        if (!await ports.store.step(o, "result", response.text)) return false;
      }
      return await ports.store.step(o, "complete");
    },
    async deliveryTick(): Promise<boolean> {
      // Claim durably records sending before the external call.
      const d = await ports.store.claimDelivery();
      if (!d || !await ports.authorizeOwner(d.user_id)) return false;
      const receipt = await ports.deliver(d);
      if (
        receipt.accepted !== true || typeof receipt.id !== "string" ||
        !receipt.id || receipt.id.length > 500
      ) throw new Error("Unknown delivery acceptance");
      return await ports.store.finishDelivery(d, {
        accepted: true,
        id: receipt.id,
      });
    },
  };
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function cloudScheduledDispatchStore(db: {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}): ScheduledDispatchStore {
  async function rpc(name: string, args: Record<string, unknown>) {
    const r = await db.rpc(name, args);
    if (r.error) throw new Error("Scheduled dispatch outcome unknown");
    return r.data;
  }
  function identity(v: unknown): asserts v is Record<string, unknown> {
    if (
      !v || typeof v !== "object" || Array.isArray(v) ||
      ["id", "user_id", "lease_token"].some((k) =>
        typeof (v as Record<string, unknown>)[k] !== "string" ||
        !uuid.test((v as Record<string, string>)[k])
      )
    ) throw new Error("Invalid claimed identity");
  }
  return {
    claim: async () => {
      const v = await rpc("claim_scheduled_occurrence", {});
      if (v === null) return null;
      identity(v);
      const o = v as unknown as Occurrence;
      if (
        !uuid.test(o.task_id) ||
        !["ready", "accepted", "result"].includes(o.state) || !o.snapshot ||
        typeof o.snapshot.title !== "string" ||
        typeof o.snapshot.prompt !== "string" ||
        (o.state === "accepted" &&
          (typeof o.provider_id !== "string" || !o.provider_id))
      ) throw new Error("Invalid occurrence");
      return o;
    },
    step: async (o, action, value) =>
      await rpc("step_scheduled_occurrence", {
        p_id: o.id,
        p_user_id: o.user_id,
        p_lease_token: o.lease_token,
        p_action: action,
        p_value: value ?? null,
      }) === true,
    claimDelivery: async () => {
      const v = await rpc("claim_scheduled_delivery", {});
      if (v === null) return null;
      identity(v);
      const d = v as unknown as Delivery;
      if (
        !["push", "email"].includes(d.channel) || !uuid.test(d.chat_id) ||
        typeof d.title !== "string" ||
        typeof d.body !== "string" || typeof d.idempotency_key !== "string" ||
        !d.idempotency_key.startsWith("scheduled:")
      ) throw new Error("Invalid delivery");
      return d;
    },
    finishDelivery: async (d, receipt) =>
      await rpc("finish_scheduled_delivery", {
        p_id: d.id,
        p_user_id: d.user_id,
        p_lease_token: d.lease_token,
        p_receipt: receipt,
      }) === true,
  };
}
