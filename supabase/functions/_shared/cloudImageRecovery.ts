import type { ClaimedCloudRun } from "./cloudRunWorker.ts";
import {
  type CloudImageMedia,
  type CloudImageProvider,
  type CloudImageReceipt,
  type CloudImageStore,
} from "./cloudImageTool.ts";
import { cloudImageRequest } from "./cloudImageHttp.ts";

/** Service-only read, also usable after the run/session was deleted. */
export async function readCloudImageReceipt(
  options: {
    supabaseUrl: string;
    serviceRoleKey: string;
    fetch?: typeof fetch;
  },
  owner: string,
  key: string,
): Promise<CloudImageReceipt | null> {
  const query = new URLSearchParams({
    user_id: `eq.${owner}`,
    receipt_key: `eq.${key}`,
    select: "*",
    limit: "1",
  });
  const r = await cloudImageRequest(
    options.fetch ?? fetch,
    `${
      options.supabaseUrl.replace(/\/$/, "")
    }/rest/v1/cloud_image_receipts?${query}`,
    {
      headers: {
        apikey: options.serviceRoleKey,
        Authorization: `Bearer ${options.serviceRoleKey}`,
      },
    },
    1000000,
  );
  if (!r.ok) throw new Error("Image recovery read unavailable");
  const rows = r.json();
  if (!Array.isArray(rows)) throw new Error("Invalid recovery receipt");
  const receipt = rows[0] ?? null;
  if (receipt && (receipt.user_id !== owner || receipt.receipt_key !== key)) {
    throw new Error("Recovery owner mismatch");
  }
  return receipt;
}

/** One bounded recovery pass, NEVER a paid start. Caller loads receipt from DB.
 * abandonReady requires a server-confirmed cancelled/terminal/deleted run.
 * recoveredResponseIds is optional operator reconciliation of a lost ID; the
 * provider GET verifies original request metadata before the ID is attached.
 * No browser-supplied receipt or response ID is trusted directly.
 */
export async function recoverCloudImage(
  receipt: CloudImageReceipt,
  options: {
    store: CloudImageStore;
    provider: CloudImageProvider;
    media: CloudImageMedia;
    abandonReady: boolean;
    recoveredResponseIds?: Record<number, string>;
  },
): Promise<CloudImageReceipt> {
  const run = {
    id: receipt.run_id,
    user_id: receipt.user_id,
    lease_token: null,
  } as unknown as ClaimedCloudRun;
  let current = receipt;
  const step = async (
    action: "accept" | "finish" | "fail" | "cancel_ready",
    index: number,
    value?: string,
  ) => {
    current = await options.store.step(
      run,
      receipt.call,
      receipt.receipt_key,
      action,
      receipt.args,
      index,
      value,
    );
  };
  for (let i = 0; i < current.slots.length && !current.settled; i++) {
    let slot = current.slots[i];
    if (slot.state === "ready") {
      if (options.abandonReady) await step("cancel_ready", i);
      continue;
    }
    if (slot.state === "submitting") {
      const id = options.recoveredResponseIds?.[i];
      if (!id) continue; // Keep reserved; no invented failure or paid retry.
      await options.provider.poll(id, receipt.receipt_key, i); // Verify binding before accepting.
      await step("accept", i, id);
      slot = current.slots[i];
    }
    if (slot.state === "pending" && slot.responseId) {
      const result = await options.provider.poll(
        slot.responseId,
        receipt.receipt_key,
        i,
      );
      if (result.state === "failed") await step("fail", i);
      if (result.state === "done") {
        const url = await options.media.save(
          receipt.user_id,
          receipt.job_id,
          i,
          result.bytes,
          receipt.args,
        );
        await step("finish", i, url);
      }
    }
  }
  return current;
}
