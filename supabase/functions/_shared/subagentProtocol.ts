export const MAX_SUBAGENTS = 8;

export type SubagentTask = {
  id: string;
  label: string;
  focus: string;
};

const FALLBACK_TASKS: readonly SubagentTask[] = [
  { id: "research", label: "Research", focus: "Gather the strongest relevant facts and assumptions." },
  { id: "options", label: "Options", focus: "Develop practical approaches and compare their tradeoffs." },
  { id: "critic", label: "Critic", focus: "Look for gaps, risks, edge cases, and weak assumptions." },
  { id: "planner", label: "Planner", focus: "Turn the useful findings into a clear sequence of next steps." },
  { id: "editor", label: "Editor", focus: "Shape the likely answer into concise, user-friendly language." },
  { id: "devil-advocate", label: "Devil's advocate", focus: "Challenge the leading answer and identify what could change the decision." },
  { id: "examples", label: "Examples", focus: "Create concrete examples that make the answer easier to apply." },
  { id: "fact-checker", label: "Fact check", focus: "Separate verified-looking claims from claims that need confirmation." },
];

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  const withoutControlCharacters = Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return !(code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31));
    })
    .join("");
  return withoutControlCharacters.trim().slice(0, maxLength);
}

export function clampSubagentCount(value: unknown, fallback = MAX_SUBAGENTS): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return Math.max(1, Math.min(MAX_SUBAGENTS, fallback));
  return Math.max(1, Math.min(MAX_SUBAGENTS, Math.floor(parsed)));
}

export function buildFallbackSubagentPlan(maxSubagents = MAX_SUBAGENTS): SubagentTask[] {
  return FALLBACK_TASKS.slice(0, clampSubagentCount(maxSubagents));
}

export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function normalizeSubagentPlan(value: unknown, maxSubagents = MAX_SUBAGENTS): SubagentTask[] {
  const limit = clampSubagentCount(maxSubagents);
  const rawTasks = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { tasks?: unknown }).tasks)
      ? (value as { tasks: unknown[] }).tasks
      : [];
  const seen = new Set<string>();
  const tasks: SubagentTask[] = [];

  for (const raw of rawTasks) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const label = cleanText(item.label ?? item.name, 80);
    const focus = cleanText(item.focus ?? item.instruction ?? item.task, 240);
    if (!label || !focus) continue;
    const rawId = cleanText(item.id, 60).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "");
    const id = rawId || `agent-${tasks.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    tasks.push({ id, label, focus });
    if (tasks.length >= limit) break;
  }

  return tasks.length > 0 ? tasks : buildFallbackSubagentPlan(limit);
}

export function parseSubagentPlan(text: string, maxSubagents = MAX_SUBAGENTS): SubagentTask[] {
  return normalizeSubagentPlan(extractJsonObject(text), maxSubagents);
}
