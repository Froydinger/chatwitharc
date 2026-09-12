import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import type { ClaimedCloudRun, CloudWorkerStore } from "./cloudRunWorker.ts";

/** Service-only adapter. RPCs validate lease fencing and session ownership;
 * no read-modify-write of chat_sessions.messages is performed in JavaScript. */
export function cloudWorkerStore(
  client: Pick<SupabaseClient, "rpc">,
): CloudWorkerStore {
  return {
    async claim(id) {
      const { data, error } = await client.rpc("claim_cloud_run", {
        p_run_id: id,
        p_lease_seconds: 90,
      });
      if (error) throw new Error("Unable to claim cloud run");
      if (!Array.isArray(data) || data.length === 0) return null;
      const run = data[0] as ClaimedCloudRun;
      const uuid = (value: unknown) =>
        typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        );
      if (
        !run || typeof run !== "object" || data.length !== 1 ||
        run.id !== id || !uuid(run.id) || !uuid(run.lease_token) ||
        !uuid(run.user_id) || !uuid(run.session_id) ||
        !["ask", "auto"].includes(run.mode) ||
        !Number.isFinite(Date.parse(run.created_at)) ||
        typeof run.started_at !== "string" ||
        !Number.isFinite(Date.parse(run.started_at)) ||
        !Number.isSafeInteger(run.session_sequence) ||
        run.session_sequence! < 1 ||
        !Number.isSafeInteger(run.input_revision) || run.input_revision! < 0 ||
        !Array.isArray(run.execution_messages) ||
        run.execution_messages.some((message: unknown) => {
          if (
            !message || typeof message !== "object" || Array.isArray(message)
          ) return true;
          const value = message as Record<string, unknown>;
          return !["user", "assistant"].includes(value.role as string) ||
            typeof value.content !== "string";
        }) ||
        !Array.isArray(run.request?.messages) || !run.checkpoint ||
        typeof run.checkpoint !== "object" || Array.isArray(run.checkpoint)
      ) {
        throw new Error("Invalid claimed run");
      }
      return run;
    },
    async checkpoint(run, checkpoint, status, reason) {
      const { data, error } = await client.rpc("checkpoint_cloud_run", {
        p_run_id: run.id,
        p_lease_token: run.lease_token,
        p_checkpoint: checkpoint,
        p_status: status,
        p_lease_seconds: 90,
        p_error: reason ?? null,
      });
      if (error) throw new Error("Unable to checkpoint cloud run");
      return data === true;
    },
    async complete(run, result, message) {
      const { data, error } = await client.rpc("complete_cloud_run", {
        p_run_id: run.id,
        p_lease_token: run.lease_token,
        p_result: result,
        p_assistant_message: message,
      });
      if (error) throw new Error("Unable to complete cloud run");
      return data === true;
    },
  };
}
