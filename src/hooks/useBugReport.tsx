import { create } from "zustand";

interface BugReportState {
  isOpen: boolean;
  errorMessage: string;
  errorStack: string;
  openBugReport: (errorMessage: string, errorStack?: string) => void;
  closeBugReport: () => void;
}

export const useBugReport = create<BugReportState>((set) => ({
  isOpen: false,
  errorMessage: "",
  errorStack: "",
  openBugReport: (errorMessage: string, errorStack: string = "") =>
    set({ isOpen: true, errorMessage, errorStack }),
  closeBugReport: () => set({ isOpen: false, errorMessage: "", errorStack: "" }),
}));
