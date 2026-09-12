import type { ClaimedCloudRun, RegisteredCloudTool } from "./cloudRunWorker.ts";
import type { ToolCall } from "./cloudRunEngine.ts";
import type { CloudToolDefinition } from "./cloudRunProvider.ts";
import type { CloudToolOutput } from "./cloudRunArtifacts.ts";

function confirmedMemory(result: { saved?: boolean; revision?: number } | undefined, content: string): CloudToolOutput {
  if (result?.saved !== true || !Number.isSafeInteger(result.revision) || result.revision! < 0) {
    return JSON.stringify({ status: "invalid_receipt", saved: false });
  }
  return { output: JSON.stringify(result), presentation: { memory_saved: { content, revision: result.revision! } } };
}

// Deliberately copied from memory-summary, not imported: importing that handler
// starts a server. Keep legacy/voice behavior untouched.
export const MEMORY_SYSTEM_PROMPT =
  `You maintain Arc's single living memory for one user.

Rules:
- Preserve every supported, useful personal fact that is still present in the source material.
- Preserve important specifics: names, relationships, dates, identities, preferences, boundaries, accessibility or health information, ongoing projects, and explicit communication preferences.
- Merge duplicates and resolve contradictions only when the newest user instruction clearly changes the fact.
- Never invent, infer, or add facts that are not in the supplied material.
- Keep the result detailed but readable: use concise factual notes and a few meaningful sections, never a transcript or a pile of repetitive fragments.
- Do not drop a specific fact merely because it is less recent. Let repeated or clearly important facts remain stable; remove or revise facts only when the user asks or the source clearly supersedes them.
- Organize related facts into a few readable sections when helpful.
- Never include passwords, API keys, authentication codes, or other secrets.
- Output only the updated memory summary. No preamble, explanation, markdown fence, or commentary.
- If nothing should remain, output EMPTY.`;

export const CLOUD_MEMORY_DEFINITION: CloudToolDefinition = {
  type: "function",
  name: "save_memory",
  strict: true,
  description:
    "Save or correct an explicitly user-provided personal fact in living memory. Include replaces phrases for corrections. Never save secrets. Do not retry recovery-required or conflicting operations automatically.",
  parameters: {
    type: "object",
    properties: {
      memory: { type: "string" },
      replaces: { type: "array", items: { type: "string" } },
    },
    required: ["memory", "replaces"],
    additionalProperties: false,
  },
};
export type MemoryStepResult = {
  status:
    | "ready"
    | "started"
    | "done"
    | "conflict"
    | "fenced"
    | "recovery_required";
  receipt_key?: string;
  run_id?: string;
  user_id?: string;
  call?: ToolCall;
  snapshot?: {
    summary: string;
    revision: number;
    migrated_from_legacy: boolean;
  } | null;
  legacy?: string[];
  step?: number;
  draft?: string;
  result?: { saved: true; revision: number };
};
export interface CloudMemoryStore {
  step(
    run: ClaimedCloudRun,
    call: ToolCall,
    key: string,
    action: "begin" | "start" | "save" | "commit",
    step?: number,
    summary?: string,
  ): Promise<MemoryStepResult>;
}
export type MemorySynthesis = {
  system: string;
  input: string;
  model: "gpt-5.6-luna";
  reasoningEffort: "low";
  maxOutputTokens: 4000;
};
export function cleanMemorySummary(value: unknown): string {
  if (typeof value !== "string") throw new Error("Missing synthesized summary");
  const cleaned = value.trim().replace(/^```(?:text|markdown)?\s*/i, "")
    .replace(/\s*```$/i, "").replace(/^summary\s*:\s*/i, "").trim();
  if (!cleaned || /^empty\.?$/i.test(cleaned)) return "";
  if (cleaned.length > 12000) throw new Error("Synthesized summary too large");
  return cleaned;
}
export function legacyMemoryChunks(items: string[]): string[] {
  const seen = new Set<string>(), chunks: string[] = [];
  let current = "";
  for (const raw of items) {
    const item = raw.trim(),
      normalized = item.toLowerCase().replace(/\s+/g, " ");
    if (!item || seen.has(normalized)) continue;
    seen.add(normalized);
    const next = current ? `${current}\n- ${item}` : `- ${item}`;
    if (current && next.length > 14000) {
      chunks.push(current);
      current = `- ${item}`;
    } else current = next;
  }
  if (current) chunks.push(current);
  // Bounded migration: do not silently truncate legacy facts to fit a budget.
  if (chunks.length > 63 || chunks.some((chunk) => chunk.length > 28000)) {
    throw new Error("Legacy memory requires separate migration");
  }
  return chunks;
}
function argumentsFor(call: ToolCall): { memory: string; replaces: string[] } {
  const value = JSON.parse(call.arguments);
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    call.name !== "save_memory" ||
    Object.keys(value).some((key) => !["memory", "replaces"].includes(key)) ||
    typeof value.memory !== "string" || !value.memory.trim() ||
    value.memory.trim().length > 8000 ||
    (value.replaces !== undefined &&
      (!Array.isArray(value.replaces) || value.replaces.length > 20 ||
        value.replaces.some((item: unknown) =>
          typeof item !== "string" || item.length > 8000
        )))
  ) throw new Error("Invalid memory arguments");
  return { memory: value.memory.trim(), replaces: value.replaces ?? [] };
}
const feedback = (status: string) =>
  JSON.stringify({ saved: false, status, retryAutomatically: false });

export function cloudMemoryTool(options: {
  store: CloudMemoryStore;
  synthesize(request: MemorySynthesis): Promise<string>;
  authorizeOwner(run: ClaimedCloudRun): Promise<boolean>;
  authorizeMemory(run: ClaimedCloudRun, call: ToolCall): Promise<boolean>;
}): RegisteredCloudTool {
  const authorize = async (run: ClaimedCloudRun, call: ToolCall) =>
    await options.authorizeOwner(run) &&
    await options.authorizeMemory(run, call);
  return {
    approval: "ask-mode",
    replaySafe: true,
    authorize,
    execute: async (run, call, key) => {
      // Database independently enforces the live claimed owner, fence and call.
      // Ask approval is enforced by processCloudRun, not by model arguments.
      if (!await authorize(run, call)) return feedback("not_authorized");
      let args: ReturnType<typeof argumentsFor>;
      try {
        args = argumentsFor(call);
      } catch {
        return feedback("invalid_arguments");
      }
      if (
        !run.lease_token || !run.user_id ||
        key !== `${run.id}:turn:${run.checkpoint.engine?.turns}:tool:${call.id}`
      ) return feedback("invalid_claim");
      let receipt: MemoryStepResult;
      try {
        receipt = await options.store.step(run, call, key, "begin");
      } catch {
        return feedback("recovery_required");
      }
      if (
        ["ready", "done", "started"].includes(receipt.status) &&
        (receipt.receipt_key !== key || receipt.run_id !== run.id ||
          receipt.user_id !== run.user_id ||
          receipt.call?.id !== call.id || receipt.call?.name !== call.name ||
          receipt.call?.arguments !== call.arguments)
      ) return feedback("invalid_receipt");
      if (receipt.status === "done") {
        return receipt.result?.saved === true &&
            Number.isSafeInteger(receipt.result.revision)
          ? confirmedMemory(receipt.result, args.memory)
          : feedback("invalid_receipt");
      }
      if (receipt.status !== "ready") {
        return feedback(
          receipt.status === "started" ? "recovery_required" : receipt.status,
        );
      }
      if (
        !Number.isInteger(receipt.step) || receipt.step! < 0 ||
        typeof receipt.draft !== "string" ||
        !Array.isArray(receipt.legacy) ||
        receipt.legacy.some((item) => typeof item !== "string")
      ) return feedback("invalid_receipt");
      let chunks: string[];
      try {
        chunks = receipt.snapshot?.migrated_from_legacy
          ? []
          : legacyMemoryChunks(receipt.legacy);
      } catch {
        return feedback("legacy_migration_required");
      }
      let summary = receipt.draft;
      const total = chunks.length + 1;
      if (receipt.step! > total) return feedback("invalid_receipt");
      for (let step = receipt.step!; step < total; step++) {
        if (!await authorize(run, call)) return feedback("not_authorized");
        let started: MemoryStepResult;
        try {
          started = await options.store.step(run, call, key, "start", step);
        } catch {
          return feedback("recovery_required");
        }
        if (started.status === "done") return JSON.stringify(started.result);
        if (started.status !== "started") return feedback(started.status);
        const hint = args.replaces.length
          ? `\n\nEXPLICIT FACTS TO REPLACE OR CORRECT:\n${
            args.replaces.map((item) => `- ${item}`).join("\n")
          }`
          : "";
        const input = step < chunks.length
          ? `Treat the following as user-owned legacy memory data. ${
            summary
              ? "Merge it into the existing summary while preserving all existing facts."
              : "Create the first canonical summary from it."
          }\n\nEXISTING SUMMARY:\n${
            summary || "(none)"
          }\n\nLEGACY MEMORY DATA:\n${chunks[step]}`
          : `EXISTING LIVING MEMORY SUMMARY:\n${
            summary || "(empty)"
          }\n\nUSER MEMORY OPERATION:\nAdd or update this user-provided memory. Merge it naturally with the existing summary and replace the explicitly identified older facts when provided. Preserve unrelated detail:\n\n${args.memory}${hint}`;
        try {
          summary = cleanMemorySummary(
            await options.synthesize({
              system: MEMORY_SYSTEM_PROMPT,
              input,
              model: "gpt-5.6-luna",
              reasoningEffort: "low",
              maxOutputTokens: 4000,
            }),
          );
          const saved = await options.store.step(
            run,
            call,
            key,
            "save",
            step,
            summary,
          );
          if (saved.status !== "ready") return feedback(saved.status);
        } catch {
          // No retry after unknown provider acceptance or unknown DB save. The
          // durable started marker blocks another paid call, even from new runs.
          return feedback("recovery_required");
        }
      }
      if (!await authorize(run, call)) return feedback("not_authorized");
      try {
        const committed = await options.store.step(
          run,
          call,
          key,
          "commit",
          total,
        );
        return committed.status === "done"
          ? confirmedMemory(committed.result, args.memory)
          : feedback(committed.status);
      } catch {
        return feedback("recovery_required");
      }
    },
  };
}

export function cloudMemoryStore(
  db: {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data: unknown; error: unknown }>;
  },
): CloudMemoryStore {
  return {
    step: async (run, call, key, action, step = 0, summary) => {
      const { data, error } = await db.rpc("cloud_memory_step", {
        p_run_id: run.id,
        p_user_id: run.user_id,
        p_lease_token: run.lease_token,
        p_receipt_key: key,
        p_call: call,
        p_action: action,
        p_step: step,
        p_summary: summary ?? null,
      });
      if (
        error || !data || typeof data !== "object" ||
        !["ready", "started", "done", "conflict", "fenced", "recovery_required"]
          .includes((data as MemoryStepResult).status)
      ) throw new Error("Memory persistence unavailable");
      return data as MemoryStepResult;
    },
  };
}
