import {
  buildFallbackSubagentPlan,
  clampSubagentCount,
  normalizeSubagentPlan,
  parseSubagentPlan,
} from "./subagentProtocol.ts";

function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}

Deno.test("subagent count is bounded to one through eight", () => {
  assert(clampSubagentCount(0) === 1);
  assert(clampSubagentCount(12) === 8);
  assert(clampSubagentCount("3") === 3);
  assert(clampSubagentCount("not a number") === 8);
});

Deno.test("planner output is normalized and capped without trusting extra fields", () => {
  const tasks = normalizeSubagentPlan({
    tasks: [
      { id: "one", label: "One", focus: "First", hidden: "ignored" },
      { id: "one", label: "Duplicate", focus: "Ignored" },
      { id: "two", label: "Two", instruction: "Second" },
      { id: "three", label: "Three", task: "Third" },
    ],
  }, 2);
  assert(tasks.length === 2);
  assert(tasks[0].id === "one" && tasks[1].focus === "Second");
  assert(!("hidden" in tasks[0]));
});

Deno.test("json wrapped in a markdown fence still produces a plan", () => {
  const tasks = parseSubagentPlan('```json\n{"tasks":[{"label":"Research","focus":"Find facts"}]}\n```', 8);
  assert(tasks.length === 1);
  assert(tasks[0].label === "Research");
});

Deno.test("invalid planner output falls back to safe bounded helpers", () => {
  const tasks = parseSubagentPlan("not json", 4);
  assert(tasks.length === 4);
  assert(JSON.stringify(tasks).length < 3000);
  assert(buildFallbackSubagentPlan(8).length === 8);
});
