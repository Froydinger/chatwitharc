import { create } from "zustand";
import type { SubagentTaskSpec } from "@/services/subagents";

export type SubagentTaskStatus = "queued" | "working" | "complete" | "failed";
export type SubagentPhase = "planning" | "working" | "synthesizing" | "complete" | "failed" | "cancelled";

export type SubagentTaskState = SubagentTaskSpec & {
  status: SubagentTaskStatus;
};

export type SubagentRunState = {
  id: string;
  phase: SubagentPhase;
  tasks: SubagentTaskState[];
  error?: string;
};

type SubagentStore = {
  run: SubagentRunState | null;
  startRun: (id: string) => void;
  setPlan: (id: string, tasks: SubagentTaskSpec[]) => void;
  setTaskStatus: (runId: string, taskId: string, status: SubagentTaskStatus) => void;
  setPhase: (runId: string, phase: SubagentPhase) => void;
  completeRun: (runId: string) => void;
  failRun: (runId: string, error: string) => void;
  clearRun: (runId?: string) => void;
};

export const useSubagentStore = create<SubagentStore>((set) => ({
  run: null,
  startRun: (id) => set({ run: { id, phase: "planning", tasks: [] } }),
  setPlan: (id, tasks) => set((state) => {
    if (state.run?.id !== id) return state;
    return {
      run: {
        ...state.run,
        phase: "working",
        tasks: tasks.map((task) => ({ ...task, status: "queued" as const })),
      },
    };
  }),
  setTaskStatus: (runId, taskId, status) => set((state) => {
    if (state.run?.id !== runId) return state;
    return {
      run: {
        ...state.run,
        tasks: state.run.tasks.map((task) => task.id === taskId ? { ...task, status } : task),
      },
    };
  }),
  setPhase: (runId, phase) => set((state) => state.run?.id === runId ? { run: { ...state.run, phase } } : state),
  completeRun: (runId) => set((state) => state.run?.id === runId ? { run: { ...state.run, phase: "complete" } } : state),
  failRun: (runId, error) => set((state) => state.run?.id === runId ? { run: { ...state.run, phase: "failed", error } } : state),
  clearRun: (runId) => set((state) => !runId || state.run?.id === runId ? { run: null } : state),
}));
