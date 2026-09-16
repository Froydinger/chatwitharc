import {
  cloudImageRequest,
  isCloudImageTransientStatus,
} from "./cloudImageHttp.ts";
import {
  CloudImagePending,
  CloudImageRecoveryRequired,
  type CloudImageReceipt,
  type CloudImageStore,
} from "./cloudImageTool.ts";
export function cloudImageStore(
  options: {
    supabaseUrl: string;
    serviceRoleKey: string;
    fetch?: typeof fetch;
  },
): CloudImageStore {
  return {
    step: async (run, call, key, action, args, index = 0, value) => {
      let response;
      try {
        response = await cloudImageRequest(
          options.fetch ?? fetch,
          `${
            options.supabaseUrl.replace(/\/$/, "")
          }/rest/v1/rpc/cloud_image_step`,
          {
            method: "POST",
            headers: {
              apikey: options.serviceRoleKey,
              Authorization: `Bearer ${options.serviceRoleKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              p_run_id: run.id,
              p_user_id: run.user_id,
              p_lease_token: run.lease_token,
              p_receipt_key: key,
              p_call: call,
              p_action: action,
              p_args: args,
              p_index: index,
              p_value: value ?? null,
            }),
          },
          1000000,
        );
      } catch {
        // Every image receipt action is keyed and idempotent. A lost response
        // can safely be replayed by the next worker lease.
        throw new CloudImagePending(run.id);
      }
      if (!response.ok) {
        if (isCloudImageTransientStatus(response.status)) {
          throw new CloudImagePending(run.id);
        }
        // A permanent rejection (bad grant, fenced lease, argument conflict) is
        // a terminal tool outcome, not a worker crash. Throwing a plain Error
        // here escaped the engine, so the run kept its lease, was silently
        // reclaimed every 5 minutes and died at the attempt limit with nothing
        // recorded. Surface it as recovery-required instead.
        throw new CloudImageRecoveryRequired(run.id);
      }
      const data = response.json();
      if (
        !data || !Array.isArray(data.slots) || typeof data.settled !== "boolean"
      ) throw new Error("Invalid image receipt");
      return data as CloudImageReceipt;
    },
  };
}
