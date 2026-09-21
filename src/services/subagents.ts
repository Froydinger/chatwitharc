import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { LUNA_MODEL } from "@/store/useModelStore";

export const MAX_SUBAGENTS = 8;

export type SubagentDirective = {
  requested: boolean;
  prompt: string;
  maxSubagents: number;
};

export type SubagentTaskSpec = {
  id: string;
  label: string;
  focus: string;
};

export type SubagentStreamEvent =
  | { type: "plan"; runId: string; tasks: SubagentTaskSpec[]; model?: string }
  | { type: "worker_started"; runId: string; id: string }
  | { type: "worker_completed"; runId: string; id: string }
  | { type: "worker_failed"; runId: string; id: string; message?: string }
  | { type: "synthesis_started"; runId: string; completed?: number; total?: number }
  | { type: "done"; runId: string; content: string; modelUsed?: string; workerCount?: number }
  | { type: "error"; runId?: string; message: string };

export type SubagentRunResult = {
  content: string;
  modelUsed: string;
  workerCount: number;
};

function clampCount(value: number | undefined): number {
  if (!Number.isFinite(value)) return MAX_SUBAGENTS;
  return Math.max(1, Math.min(MAX_SUBAGENTS, Math.floor(value as number)));
}

/** Explicit opt-in only. Ordinary complex Chat never auto-spawns helpers. */
export function parseSubagentDirective(input: string): SubagentDirective {
  const source = input.trim();
  const match = source.match(/\bspawn(?:\s+up\s+to)?(?:\s+(\d+))?\s+subagents?\b/i);
  if (!match || match.index === undefined) {
    return { requested: false, prompt: source, maxSubagents: MAX_SUBAGENTS };
  }

  const before = source.slice(0, match.index);
  if (/(?:don't|do not|never|without)\s*$/i.test(before)) {
    return { requested: false, prompt: source, maxSubagents: MAX_SUBAGENTS };
  }

  const prompt = source
    .slice(0, match.index)
    .concat(" ", source.slice(match.index + match[0].length))
    .replace(/\s+/g, " ")
    .replace(/^\s*(?:to|for)\s+/i, "")
    .replace(/^[\s:,-]+|[\s:,-]+$/g, "")
    .trim();

  return {
    requested: true,
    prompt: prompt || "Use the most recent user request as the task.",
    maxSubagents: clampCount(match[1] ? Number(match[1]) : undefined),
  };
}

type RunRequest = {
  prompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxSubagents: number;
  signal?: AbortSignal;
  onEvent?: (event: SubagentStreamEvent) => void;
};

function parseErrorBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.error === "string" ? parsed.error : "";
  } catch {
    return "";
  }
}

export async function runChatSubagents({
  prompt,
  messages,
  maxSubagents,
  signal,
  onEvent,
}: RunRequest): Promise<SubagentRunResult> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Parallel Chat help needs Supabase configuration.");
  }

  const { data: { session } } = await supabase.auth.getSession();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!session?.access_token || !supabaseUrl || !supabaseKey) {
    throw new Error("Sign in before using parallel Chat help.");
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/chat-subagents`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabaseKey,
    },
    body: JSON.stringify({
      prompt,
      messages: messages.slice(-16),
      maxSubagents: clampCount(maxSubagents),
    }),
    signal,
  });

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(parseErrorBody(raw) || `Parallel Chat help failed (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream") || !response.body) {
    throw new Error("Parallel Chat help returned an invalid response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: SubagentRunResult | null = null;

  const processLine = (line: string) => {
    if (line.endsWith("\r")) line = line.slice(0, -1);
    if (!line.startsWith("data: ")) return;
    const raw = line.slice(6).trim();
    if (!raw || raw === "[DONE]") return;

    let event: SubagentStreamEvent;
    try {
      event = JSON.parse(raw) as SubagentStreamEvent;
    } catch {
      return;
    }

    if (event.type === "error") throw new Error(event.message || "Parallel Chat help failed.");
    if (event.type === "done") {
      result = {
        content: event.content || "",
        modelUsed: event.modelUsed || LUNA_MODEL,
        workerCount: event.workerCount || 0,
      };
    }
    onEvent?.(event);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        processLine(line);
      }
    }
    if (buffer.trim()) processLine(buffer);
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  if (!result) throw new Error("Parallel Chat help ended before Arc finished synthesizing.");
  return result;
}
