import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";

export type DashboardNavPhase =
  | "button_start"
  | "canvas_save_scheduled"
  | "navigate_called"
  | "navigate_returned"
  | "dashboard_commit"
  | "dashboard_frame_1"
  | "dashboard_frame_2"
  | "chat_sync_start"
  | "chat_sync_finish"
  | "chat_sync_error"
  | "counts_start"
  | "apps_query_finish"
  | "images_query_finish"
  | "reminders_query_finish"
  | "counts_finish"
  | "counts_error";

type DashboardNavTrace = {
  id: string;
  userId: string;
  startedAtMs: number;
  startedAtPerformance: number;
};

const STORAGE_KEY = "arc:dashboard-nav-trace";
const TRACE_TTL_MS = 30_000;
let activeTrace: DashboardNavTrace | null = null;
let clearTimer: number | null = null;

type TimingClient = {
  from: (table: string) => {
    insert: (row: { trace_id: string; user_id: string; phase: DashboardNavPhase; elapsed_ms: number }) => Promise<{ error: unknown }>;
  };
};

function makeTraceId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function saveTrace(trace: DashboardNavTrace) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      id: trace.id,
      userId: trace.userId,
      startedAtMs: trace.startedAtMs,
    }));
  } catch {
    // A blocked session store should not affect navigation.
  }
}

function readStoredTrace(): DashboardNavTrace | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown; userId?: unknown; startedAtMs?: unknown };
    if (typeof parsed.id !== "string" || typeof parsed.userId !== "string" || typeof parsed.startedAtMs !== "number") return null;
    if (Date.now() - parsed.startedAtMs > TRACE_TTL_MS) return null;
    const elapsed = Math.max(0, Date.now() - parsed.startedAtMs);
    return {
      id: parsed.id,
      userId: parsed.userId,
      startedAtMs: parsed.startedAtMs,
      startedAtPerformance: performance.now() - elapsed,
    };
  } catch {
    return null;
  }
}

function currentTrace() {
  if (activeTrace) return activeTrace;
  activeTrace = readStoredTrace();
  return activeTrace;
}

function scheduleTraceCleanup(traceId: string) {
  if (clearTimer !== null) window.clearTimeout(clearTimer);
  clearTimer = window.setTimeout(() => {
    if (activeTrace?.id !== traceId) return;
    activeTrace = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }, TRACE_TTL_MS);
}

export function startDashboardNavTrace(userId: string) {
  const trace: DashboardNavTrace = {
    id: makeTraceId(),
    userId,
    startedAtMs: Date.now(),
    startedAtPerformance: performance.now(),
  };
  activeTrace = trace;
  saveTrace(trace);
  scheduleTraceCleanup(trace.id);
  logDashboardNavPhase("button_start");
  return trace.id;
}

export function logDashboardNavPhase(phase: DashboardNavPhase) {
  const trace = currentTrace();
  if (!trace || !isSupabaseConfigured) return;

  const elapsedMs = Math.max(0, Math.round(performance.now() - trace.startedAtPerformance));
  // This table is intentionally temporary and is not in the generated schema
  // types. Defer the network request itself so diagnostics cannot contend with
  // the navigation event or the dashboard's first commit on iOS.
  const write = () => {
    const timingClient = supabase as unknown as TimingClient;
    void timingClient
      .from("dashboard_nav_timings")
      .insert({ trace_id: trace.id, user_id: trace.userId, phase, elapsed_ms: elapsedMs })
      .then(({ error }: { error: unknown }) => {
        if (error) console.warn("[dashboard-nav] timing write failed", error);
      })
      .catch((error: unknown) => console.warn("[dashboard-nav] timing write failed", error));
  };
  if (typeof window !== "undefined") window.setTimeout(write, 0);
  else write();
}
