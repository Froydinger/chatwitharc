import { create } from 'zustand';

export type BotTestDevice = 'desktop' | 'mobile';
export type BotTestStatus = 'idle' | 'preparing' | 'running' | 'passed' | 'failed';

export interface BotTestFrame {
  i: number;
  device: BotTestDevice;
  action: string;
  label: string;
  /** Action target in frame pixel space; null for steps with no element (goto, wait). */
  x: number | null;
  y: number | null;
  vw: number;
  vh: number;
  ok: boolean;
  error?: string;
  done?: boolean;
  screenshot?: string;
}

/** Only the newest frame per device is rendered, so there is no reason to grow forever. */
const MAX_FRAMES_PER_DEVICE = 2;

interface BotTestState {
  runId: string | null;
  status: BotTestStatus;
  devices: BotTestDevice[];
  goal: string;
  label: string;
  stepCount: number;
  stepsSeen: number;
  nextIndex: number;
  /** Newest frames keyed by device, so "both" can render two PIPs at once. */
  byDevice: Partial<Record<BotTestDevice, BotTestFrame[]>>;
  failures: string[];

  startRun: (args: { runId: string; devices: BotTestDevice[]; goal?: string; stepCount?: number }) => void;
  pushFrames: (frames: BotTestFrame[]) => void;
  endRun: (status: 'passed' | 'failed') => void;
  reset: () => void;
}

const EMPTY = {
  runId: null,
  status: 'idle' as BotTestStatus,
  devices: [] as BotTestDevice[],
  goal: '',
  label: '',
  stepCount: 0,
  stepsSeen: 0,
  nextIndex: 0,
  byDevice: {},
  failures: [] as string[],
};

export const useBotTestStore = create<BotTestState>((set) => ({
  ...EMPTY,

  startRun: ({ runId, devices, goal, stepCount }) =>
    set({
      ...EMPTY,
      runId,
      devices: devices.length ? devices : ['desktop'],
      goal: goal || '',
      stepCount: stepCount || 0,
      status: 'preparing',
      label: 'Preparing browser…',
    }),

  pushFrames: (frames) =>
    set((state) => {
      if (!frames.length) return state;
      const byDevice = { ...state.byDevice };
      const failures = [...state.failures];
      let label = state.label;
      let stepsSeen = state.stepsSeen;

      for (const frame of frames) {
        if (frame.done) continue;
        const list = [...(byDevice[frame.device] || []), frame].slice(-MAX_FRAMES_PER_DEVICE);
        byDevice[frame.device] = list;
        label = frame.label || label;
        stepsSeen += 1;
        if (!frame.ok && frame.error) failures.push(`${frame.label}: ${frame.error}`);
      }

      const highest = Math.max(state.nextIndex - 1, ...frames.map((f) => f.i));
      return {
        ...state,
        byDevice,
        failures,
        label,
        stepsSeen,
        nextIndex: highest + 1,
        status: state.status === 'preparing' ? 'running' : state.status,
      };
    }),

  endRun: (status) =>
    set((state) => ({
      ...state,
      status,
      label: status === 'passed' ? 'Finished' : 'Finished with problems',
    })),

  reset: () => set({ ...EMPTY }),
}));
