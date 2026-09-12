import type { ClaimedCloudRun, RegisteredCloudTool } from "./cloudRunWorker.ts";
import type { ToolCall } from "./cloudRunEngine.ts";
import type { CloudToolDefinition } from "./cloudRunProvider.ts";

const text = { type: ["string", "null"] };
const flag = { type: ["boolean", "null"] };
const common = {
  title: text,
  prompt: text,
  when_iso: text,
  cron_expr: text,
  deliver_push: flag,
  deliver_email: flag,
};
function definition(
  name: string,
  description: string,
  properties: Record<string, unknown>,
): CloudToolDefinition {
  return {
    type: "function",
    name,
    strict: true,
    description,
    parameters: {
      type: "object",
      properties,
      required: Object.keys(properties),
      additionalProperties: false,
    },
  };
}
export const CLOUD_SCHEDULED_DEFINITIONS: CloudToolDefinition[] = [
  definition(
    "get_scheduled_task",
    "Read a current-user scheduled task. task_id=null captures the latest active task once. Use returned task_id and expected_version verbatim in update_scheduled_task. Never guess an ID/version. This receipt stays frozen on retries.",
    { task_id: text },
  ),
  definition(
    "schedule_task",
    "Create a future scheduled task for the current user. Provide title and prompt and exactly one of when_iso (UTC ISO ending Z) or cron_expr (five UTC fields). Null means omitted. Cron supports numbers, *, */n, lists and ranges; day-of-month and weekday both must match. Ask if timing is unclear. Push defaults true; email false. Results use a separate scheduled-result chat. Saving does not guarantee future execution/delivery.",
    common,
  ),
  definition(
    "update_scheduled_task",
    "Update or cancel exactly the task captured by get_scheduled_task. task_id and expected_version are mandatory and approval binds both. Never resolve latest during an update, automatically refresh a conflict, or recreate a missing task. Null leaves fields unchanged. cancel=true must not include edits; already running work may still finish.",
    {
      task_id: { type: "string" },
      expected_version: { type: "string" },
      ...common,
      cancel: flag,
    },
  ),
];
export type CloudScheduledReceipt = {
  status: "done" | "fenced" | "approval_required";
  receipt_key?: string;
  run_id?: string;
  user_id?: string;
  call?: ToolCall;
  result?: Record<string, unknown>;
};
export interface CloudScheduledStore {
  apply(
    run: ClaimedCloudRun,
    call: ToolCall,
    key: string,
  ): Promise<CloudScheduledReceipt>;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateCloudScheduledCall(call: ToolCall): void {
  const def = CLOUD_SCHEDULED_DEFINITIONS.find((d) => d.name === call.name);
  if (!def || call.arguments.length > 12000) {
    throw new Error("Invalid scheduled tool");
  }
  const args = JSON.parse(call.arguments);
  const keys = Object.keys(
    (def.parameters as { properties: object }).properties,
  );
  if (
    !args || typeof args !== "object" || Array.isArray(args) ||
    Object.keys(args).some((k) => !keys.includes(k))
  ) throw new Error("Unexpected argument");
  for (const [key, value] of Object.entries(args)) {
    if (value === null) continue;
    if (["deliver_push", "deliver_email", "cancel"].includes(key)) {
      if (typeof value !== "boolean") throw new Error("Invalid boolean");
    } else if (typeof value !== "string") throw new Error("Invalid string");
  }
  for (const [key, max] of [["title", 200], ["prompt", 4000]] as const) {
    if (args[key] != null && (!args[key].trim() || args[key].length > max)) {
      throw new Error("Invalid content");
    }
  }
  if (args.task_id != null && !uuid.test(args.task_id)) {
    throw new Error("Invalid task id");
  }
  if (
    args.when_iso != null &&
    (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(
      args.when_iso,
    ) || !Number.isFinite(Date.parse(args.when_iso)))
  ) throw new Error("Invalid UTC time");
  if (
    args.cron_expr != null &&
    (args.cron_expr.length > 200 ||
      args.cron_expr.trim().split(/\s+/).length !== 5)
  ) throw new Error("Invalid cron");
  if (args.when_iso != null && args.cron_expr != null) {
    throw new Error("Choose one schedule");
  }
  if (
    call.name === "schedule_task" &&
    (!args.title || !args.prompt || !(args.when_iso || args.cron_expr))
  ) throw new Error("Missing schedule");
  if (call.name === "update_scheduled_task") {
    if (
      !args.task_id || typeof args.expected_version !== "string" ||
      !/^[0-9a-f]{64}$/.test(args.expected_version)
    ) throw new Error("Capture exact task first");
    const changes = Object.keys(args).filter((k) =>
      !["task_id", "expected_version", "cancel"].includes(k) && args[k] !== null
    );
    if (args.cancel === true ? changes.length > 0 : changes.length === 0) {
      throw new Error("Invalid update");
    }
  }
}
const feedback = (status: string) =>
  JSON.stringify({ performed: false, status, retryAutomatically: false });
/** No model/provider calls. Register all three definitions/tools together.
 * authorizeSchedule must enforce current policy/entitlements for both modes;
 * the worker and SQL additionally enforce exact Ask approval for mutations. */
export function cloudScheduledTools(options: {
  store: CloudScheduledStore;
  authorizeOwner(run: ClaimedCloudRun): Promise<boolean>;
  authorizeSchedule(run: ClaimedCloudRun, call: ToolCall): Promise<boolean>;
}): Record<string, RegisteredCloudTool> {
  return Object.fromEntries(CLOUD_SCHEDULED_DEFINITIONS.map((def) => {
    const authorize = async (run: ClaimedCloudRun, call: ToolCall) => {
      try {
        validateCloudScheduledCall(call);
      } catch {
        return false;
      }
      return call.name === def.name && await options.authorizeOwner(run) &&
        (def.name === "get_scheduled_task" ||
          await options.authorizeSchedule(run, call));
    };
    const tool: RegisteredCloudTool = {
      approval: def.name === "get_scheduled_task" ? "never" : "ask-mode",
      replaySafe: true,
      authorize,
      execute: async (run, call, key) => {
        if (!await authorize(run, call)) {
          return feedback("not_authorized_or_invalid");
        }
        if (
          ![run.id, run.user_id, run.session_id, run.lease_token].every((v) =>
            typeof v === "string" && uuid.test(v)
          ) ||
          !Number.isSafeInteger(run.checkpoint.engine?.turns) ||
          key !==
            `${run.id}:turn:${run.checkpoint.engine?.turns}:tool:${call.id}`
        ) return feedback("invalid_claim");
        // A transport failure must throw, leaving the engine's started receipt
        // replayable. One atomic SQL transaction makes that retry safe.
        const receipt = await options.store.apply(run, call, key);
        if (receipt.status !== "done") return feedback(receipt.status);
        if (
          receipt.receipt_key !== key || receipt.run_id !== run.id ||
          receipt.user_id !== run.user_id ||
          receipt.call?.id !== call.id || receipt.call?.name !== call.name ||
          receipt.call?.arguments !== call.arguments ||
          !receipt.result || typeof receipt.result !== "object" ||
          Array.isArray(receipt.result)
        ) throw new Error("Invalid scheduled receipt");
        // Plain output only. Main owns confirmation-card/artifact integration.
        return JSON.stringify(receipt.result);
      },
    };
    return [def.name, tool];
  }));
}
export function cloudScheduledStore(db: {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}): CloudScheduledStore {
  return {
    apply: async (run, call, key) => {
      const { data, error } = await db.rpc("cloud_scheduled_step", {
        p_run_id: run.id,
        p_user_id: run.user_id,
        p_lease_token: run.lease_token,
        p_receipt_key: key,
        p_call: call,
      });
      if (
        error || !data || typeof data !== "object" ||
        !["done", "fenced", "approval_required"].includes(
          (data as CloudScheduledReceipt).status,
        )
      ) throw new Error("Scheduled persistence outcome unknown");
      return data as CloudScheduledReceipt;
    },
  };
}
