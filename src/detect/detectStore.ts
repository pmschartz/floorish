import { create } from "zustand";
import { api } from "../api/client";
import { usePlan } from "../state/planStore";
import { buildProposal, carryOverNames, type Proposal } from "./buildProposal";
import { preparePlanImage } from "./pixels";

interface DetectState {
  status: "idle" | "running" | "review" | "error";
  step: string;
  error: string;
  proposal: Proposal | null;
  keepRoom: boolean[];
  /** Claude's name for rooms that took the name of a room you'd already traced. */
  detectedName: (string | null)[];
  keepDoors: boolean;
  keepWindows: boolean;
  keepOpenings: boolean;
  keepFixtures: boolean;
  replace: boolean;
  /** The server returned its saved reading of this same image (no charge). */
  reused: boolean;
  start: (force?: boolean) => Promise<void>;
  cancel: () => void;
  apply: () => void;
  set: (patch: Partial<DetectState>) => void;
}

let controller: AbortController | null = null;

export const useDetect = create<DetectState>((set, get) => ({
  status: "idle",
  step: "",
  error: "",
  proposal: null,
  keepRoom: [],
  detectedName: [],
  keepDoors: true,
  keepWindows: true,
  keepOpenings: true,
  keepFixtures: true,
  replace: true,
  reused: false,

  set: (patch) => set(patch),

  start: async (force = false) => {
    const plan = usePlan.getState().plan;
    if (!plan?.image) return;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    set({ status: "running", step: "Preparing the image…", error: "", proposal: null });
    try {
      const img = await preparePlanImage(plan.image.url);
      set({ step: "Claude is reading the floor plan…" });
      const { data: raw, reused } = await api.detect(
        { image: img.forClaude.base64, mediaType: img.forClaude.mediaType, width: img.forClaude.width, height: img.forClaude.height, force },
        signal,
      );
      if (signal.aborted) return;
      set({ step: "Snapping to walls…" });
      const built = buildProposal(raw, img.factor, img.mask, plan.pxPerInch, img.ink, img.fill);
      const current = usePlan.getState().plan;
      // Rooms you already named keep your names (e.g. a bedroom you use as an office).
      const { rooms, detectedName } = carryOverNames(built.rooms, current?.rooms ?? []);
      const proposal = { ...built, rooms };
      const hasExisting = !!current && (current.rooms.length > 0 || current.items.some((i) => ["door", "window", "opening", "fixture"].includes(i.shape)));
      set({
        status: "review",
        proposal,
        keepRoom: proposal.rooms.map(() => true),
        detectedName,
        keepDoors: true,
        keepWindows: true,
        keepOpenings: true,
        keepFixtures: true,
        replace: hasExisting,
        reused,
      });
    } catch (e) {
      if (signal.aborted) return;
      set({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  },

  cancel: () => {
    controller?.abort();
    controller = null;
    set({ status: "idle", proposal: null, error: "" });
  },

  apply: () => {
    const s = get();
    const p = s.proposal;
    if (!p) return;
    const keepItem = (shape: string) =>
      shape === "door" ? s.keepDoors : shape === "window" ? s.keepWindows : shape === "fixture" ? s.keepFixtures : s.keepOpenings;
    usePlan.getState().applyDetection({
      ppi: p.ppi,
      wallThickness: p.wallThickness,
      rooms: p.rooms.filter((_, i) => s.keepRoom[i]),
      openings: [...p.openings, ...p.fixtures].filter((o) => keepItem(o.shape)),
      replace: s.replace,
    });
    usePlan.getState().setCleanView(true);
    set({ status: "idle", proposal: null });
  },
}));
