import type { ClaimedCloudRun, RegisteredCloudTool } from "./cloudRunWorker.ts";
import { CloudToolContinuation, type ToolCall } from "./cloudRunEngine.ts";
import type { CloudPresentation } from "./cloudRunArtifacts.ts";
import type { CloudToolDefinition } from "./cloudRunProvider.ts";
export type CloudImageArgs = {
  kind: "generate" | "edit";
  prompt: string;
  model: string;
  aspectRatio: string;
  count: number;
  sourceUrls: string[];
  transparent: boolean;
};
export type CloudImageSlot = {
  state: "ready" | "submitting" | "pending" | "done" | "failed";
  responseId?: string;
  url?: string;
};
export type CloudGeneratedImage = {
  success: boolean;
  jobId: string;
  imageUrl: string | null;
  imageUrls: string[];
  prompt: string;
  model: string;
  jobType: "generate" | "edit";
  quota: Record<string, unknown>;
};
export type CloudImageReceipt = {
  receipt_key: string;
  run_id: string;
  user_id: string;
  call: ToolCall;
  args: CloudImageArgs;
  job_id: string;
  slots: CloudImageSlot[];
  settled: boolean;
  dispatch?: boolean;
  quota: Record<string, unknown>;
};
export type CloudImageAction =
  | "begin"
  | "start"
  | "accept"
  | "finish"
  | "fail"
  | "cancel_ready";
export interface CloudImageStore {
  step(
    run: ClaimedCloudRun,
    call: ToolCall,
    key: string,
    action: CloudImageAction,
    args: CloudImageArgs,
    index?: number,
    value?: string,
  ): Promise<CloudImageReceipt>;
}
export class CloudImagePending extends CloudToolContinuation {
  constructor(public jobId: string) {
    super("pending");
    this.name = "CloudImagePending";
  }
}
export class CloudImageRecoveryRequired extends CloudToolContinuation {
  constructor(public jobId: string) {
    super("recovery_required");
    this.name = "CloudImageRecoveryRequired";
  }
}
export class CloudImageRejected extends Error {}
export interface CloudImageProvider {
  start(
    args: CloudImageArgs,
    owner: string,
    receiptKey: string,
    index: number,
    beforeSubmit?: () => Promise<boolean>,
  ): Promise<string>;
  poll(
    id: string,
    receiptKey: string,
    index: number,
  ): Promise<
    { state: "pending" } | { state: "failed" } | {
      state: "done";
      bytes: Uint8Array;
    }
  >;
}
export interface CloudImageMedia {
  save(
    owner: string,
    jobId: string,
    index: number,
    bytes: Uint8Array,
    args: CloudImageArgs,
  ): Promise<string>;
}
export const CLOUD_IMAGE_DEFINITIONS: CloudToolDefinition[] = [
  "generate_image",
  "edit_image",
].map((name) => ({
  type: "function",
  name,
  strict: true,
  description:
    "Generate or edit 1–3 images. Pro is the default for generation and edits and uses GPT Image 2.5 Sunburst; Quick is available only when explicitly requested. Pro requires Boost/admin. Edits require owner-owned persisted source URLs; never pass base64 or browser credentials. Preserve the user prompt. Do not retry a recovery-required image with a new tool call.",
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      model: { type: "string", enum: ["quick", "pro", "legacy"] },
      aspectRatio: {
        type: "string",
        enum: [
          "1:1",
          "3:2",
          "4:3",
          "16:9",
          "21:9",
          "2:3",
          "3:4",
          "9:16",
          "source",
        ],
      },
      count: { type: "integer", minimum: 1, maximum: 3 },
      sourceUrls: { type: "array", items: { type: "string" }, maxItems: 10 },
      transparent: { type: "boolean" },
    },
    required: [
      "prompt",
      "model",
      "aspectRatio",
      "count",
      "sourceUrls",
      "transparent",
    ],
    additionalProperties: false,
  },
}));
export function cloudImageArguments(call: ToolCall): CloudImageArgs {
  if (
    !["generate_image", "edit_image"].includes(call.name) ||
    call.arguments.length > 40000
  ) throw new Error("Invalid image call");
  const a = JSON.parse(call.arguments),
    kind = call.name === "edit_image" ? "edit" : "generate";
  if (
    !a ||
    Object.keys(a).some((k) =>
      !["prompt", "model", "aspectRatio", "count", "sourceUrls", "transparent"]
        .includes(k)
    ) || typeof a.prompt !== "string" || !a.prompt.trim() ||
    a.prompt.length > 12000 || !Number.isInteger(a.count) || a.count < 1 ||
    a.count > 3 || !Array.isArray(a.sourceUrls) || a.sourceUrls.length > 10 ||
    a.sourceUrls.some((u: unknown) =>
      typeof u !== "string" || u.length > 2048
    ) || typeof a.transparent !== "boolean"
  ) throw new Error("Invalid image arguments");
  const model = ({
    quick: "gpt-image-2.5-flare",
    pro: "gpt-image-2.5-sunburst",
    legacy: "gpt-image-2",
  } as Record<string, string>)[
    a.model ?? "pro"
  ];
  if (
    !model ||
    !["1:1", "3:2", "4:3", "16:9", "21:9", "2:3", "3:4", "9:16", "source"]
      .includes(a.aspectRatio) ||
    (kind === "generate" &&
      (a.sourceUrls.length || a.aspectRatio === "source")) ||
    (kind === "edit" && !a.sourceUrls.length)
  ) throw new Error("Invalid image options");
  return {
    kind,
    prompt: a.prompt.trim(),
    model,
    aspectRatio: a.aspectRatio,
    count: a.count,
    sourceUrls: a.sourceUrls,
    transparent: a.transparent ||
      /\btransparent\b|\bremove (?:the )?background\b|\bno background\b/i.test(
        a.prompt,
      ),
  };
}
export function cloudImageTool(
  options: {
    store: CloudImageStore;
    provider: CloudImageProvider;
    media: CloudImageMedia;
    authorizeOwner(run: ClaimedCloudRun): Promise<boolean>;
  },
): RegisteredCloudTool {
  return {
    approval: "never",
    replaySafe: true,
    authorize: async (run, call) =>
      ["generate_image", "edit_image"].includes(call.name) &&
      await options.authorizeOwner(run),
    execute: async (run, call, key) => {
      if (!await options.authorizeOwner(run)) {
        throw new Error(
          "Image authorization denied",
        );
      }
      const args = cloudImageArguments(call);
      const step = async (
        action: CloudImageAction,
        index = 0,
        value?: string,
      ) => {
        const r = await options.store.step(
          run,
          call,
          key,
          action,
          args,
          index,
          value,
        );
        if (
          r.receipt_key !== key || r.run_id !== run.id ||
          r.user_id !== run.user_id ||
          JSON.stringify(r.call) !== JSON.stringify(call) ||
          JSON.stringify(r.args) !== JSON.stringify(args)
        ) {
          // JSONB key order is immaterial.
          if (
            r.receipt_key !== key || r.run_id !== run.id ||
            r.user_id !== run.user_id || r.call?.id !== call.id ||
            r.call?.name !== call.name ||
            r.call?.arguments !== call.arguments ||
            JSON.stringify(Object.entries(r.args).sort()) !==
              JSON.stringify(Object.entries(args).sort())
          ) throw new Error("Image receipt conflict");
        }
        return r;
      };
      let receipt = await step("begin");
      for (let i = 0; i < receipt.slots.length && !receipt.settled; i++) {
        let slot = receipt.slots[i];
        if (slot.state === "ready") {
          if (!await options.authorizeOwner(run)) {
            throw new Error(
              "Image claim lost",
            );
          }
          receipt = await step("start", i);
          slot = receipt.slots[i];
          if (receipt.dispatch) {
            try {
              const id = await options.provider.start(
                args,
                run.user_id,
                key,
                i,
                () => options.authorizeOwner(run),
              );
              receipt = await step("accept", i, id);
            } catch (error) {
              if (error instanceof CloudImageRejected) {
                receipt = await step("fail", i);
                continue;
              }
              throw new CloudImageRecoveryRequired(receipt.job_id);
            }
            throw new CloudImagePending(receipt.job_id);
          }
        }
        if (slot.state === "submitting") {
          throw new CloudImageRecoveryRequired(
            receipt.job_id,
          );
        }
        if (slot.state === "pending" && slot.responseId) {
          const result = await options.provider.poll(slot.responseId, key, i);
          if (result.state === "pending") {
            throw new CloudImagePending(
              receipt.job_id,
            );
          }
          if (result.state === "failed") receipt = await step("fail", i);
          else {
            const url = await options.media.save(
              run.user_id,
              receipt.job_id,
              i,
              result.bytes,
              args,
            );
            receipt = await step("finish", i, url);
          }
        }
      }
      if (!receipt.settled) throw new CloudImagePending(receipt.job_id);
      if (!await options.authorizeOwner(run)) {
        throw new Error(
          "Image claim lost before presentation",
        );
      }
      const imageUrls = receipt.slots.flatMap((s) =>
        s.state === "done" && s.url ? [s.url] : []
      );
      const result = {
        success: imageUrls.length > 0,
        jobId: receipt.job_id,
        imageUrl: imageUrls[0] ?? null,
        imageUrls,
        prompt: args.prompt,
        model: args.model,
        jobType: args.kind,
        quota: receipt.quota,
      };
      const presentation: CloudPresentation & {
        generated_image: CloudGeneratedImage;
      } = { generated_image: result };
      return { output: JSON.stringify(result), presentation };
    },
  };
}
