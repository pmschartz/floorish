import { create } from "zustand";

/** The plan you chose to draw on the blank grid instead of uploading a floor plan (this session). */
export const useGridChoice = create<{ planId: string | null; choose: (planId: string) => void }>((set) => ({
  planId: null,
  choose: (planId) => set({ planId }),
}));
