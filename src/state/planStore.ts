import { nanoid } from "nanoid";
import { temporal } from "zundo";
import { create } from "zustand";
import type { Item, Plan, Point, Room, StyleProfile } from "../../shared/schemas";
import { api } from "../api/client";
import type { CatalogEntry } from "../catalog/furniture";
import type { UnitSystem } from "../model/units";

export type Tool = "select" | "pan" | "calibrate" | "room" | "room-rect";
export type SaveStatus = "saved" | "saving" | "error" | "idle";

/** Pixels per inch used when there's no floor plan image (a blank grid). */
export const GRID_PPI = 2;

interface PlanState {
  plan: Plan | null;
  selectedItemId: string | null;
  selectedRoomId: string | null;
  tool: Tool;
  units: UnitSystem;
  cleanView: boolean;
  saveStatus: SaveStatus;
  saveError: string | null;

  loadPlan: (id: string) => Promise<void>;
  setPlan: (plan: Plan) => void; // replace without undo history (e.g. after image upload)
  closePlan: () => void;
  setTool: (tool: Tool) => void;
  setUnits: (u: UnitSystem) => void;
  setCleanView: (on: boolean) => void;
  select: (sel: { item?: string | null; room?: string | null }) => void;

  rename: (name: string) => void;
  calibrate: (pxPerInch: number) => void;
  setStyle: (style: StyleProfile) => void;

  addItem: (entry: CatalogEntry, at: Point, overrides?: Partial<Item>) => Item;
  updateItem: (id: string, patch: Partial<Item>) => void;
  removeItem: (id: string) => void;
  duplicateItem: (id: string) => void;

  addRoom: (polygon: Point[]) => Room;
  updateRoom: (id: string, patch: Partial<Room>) => void;
  removeRoom: (id: string) => void;

  /** Add (or swap in) rooms, doors and windows found by auto-detect, as one undoable step. */
  applyDetection: (d: {
    ppi: number;
    wallThickness: number;
    rooms: Omit<Room, "id">[];
    openings: Omit<Item, "id">[];
    replace: boolean;
  }) => void;
}

const OPENING_SHAPES = new Set<Item["shape"]>(["door", "window", "opening"]);

const pref = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const savePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* per-viewer convenience only */
  }
};
const loadUnits = (): UnitSystem => (pref("units") === "metric" ? "metric" : "imperial");

export const usePlan = create<PlanState>()(
  temporal(
    (set, get) => {
      const edit = (fn: (p: Plan) => Plan) => {
        const p = get().plan;
        if (p) set({ plan: fn(p) });
      };
      return {
        plan: null,
        selectedItemId: null,
        selectedRoomId: null,
        tool: "select",
        units: loadUnits(),
        cleanView: pref("cleanView") === "1",
        saveStatus: "idle",
        saveError: null,

        loadPlan: async (id) => {
          const plan = await api.getPlan(id);
          get().setPlan(plan);
        },
        setPlan: (plan) => {
          set({ plan, selectedItemId: null, selectedRoomId: null, tool: "select", saveStatus: "saved" });
          usePlan.temporal.getState().clear();
          lastSaved = JSON.stringify(plan);
        },
        closePlan: () => {
          set({ plan: null, selectedItemId: null, selectedRoomId: null });
          usePlan.temporal.getState().clear();
        },
        setTool: (tool) => set({ tool }),
        setUnits: (units) => {
          savePref("units", units);
          set({ units });
        },
        setCleanView: (cleanView) => {
          savePref("cleanView", cleanView ? "1" : "0");
          set({ cleanView });
        },
        select: ({ item, room }) =>
          set({
            selectedItemId: item === undefined ? (room ? null : get().selectedItemId) : item,
            selectedRoomId: room === undefined ? (item ? null : get().selectedRoomId) : room,
          }),

        rename: (name) => edit((p) => ({ ...p, name })),

        // Rooms and furniture were placed against the image, so keep them where they
        // are on the image (rescale positions) while furniture keeps its real size.
        calibrate: (ppi) =>
          edit((p) => {
            const old = p.pxPerInch ?? (p.image ? null : GRID_PPI);
            const k = old ? old / ppi : 1;
            const mv = (pt: Point) => ({ x: pt.x * k, y: pt.y * k });
            return {
              ...p,
              pxPerInch: ppi,
              rooms: p.rooms.map((r) => ({ ...r, polygon: r.polygon.map(mv) })),
              items: p.items.map((i) => ({ ...i, ...mv(i) })),
            };
          }),

        setStyle: (style) => edit((p) => ({ ...p, style })),

        addItem: (entry, at, overrides) => {
          const item: Item = {
            id: nanoid(8),
            catalogKey: entry.key.startsWith("custom-") ? "custom" : entry.key,
            label: entry.key.startsWith("custom-") ? "" : entry.label,
            category: entry.category,
            shape: entry.shape,
            x: Math.round(at.x),
            y: Math.round(at.y),
            width: entry.width,
            depth: entry.depth,
            height: entry.height,
            rotation: 0,
            flip: false,
            color: "",
            status: "existing",
            notes: "",
            shopResults: null,
            ...overrides,
          };
          edit((p) => ({ ...p, items: [...p.items, item] }));
          set({ selectedItemId: item.id, selectedRoomId: null });
          return item;
        },
        updateItem: (id, patch) =>
          edit((p) => ({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
        removeItem: (id) => {
          edit((p) => ({ ...p, items: p.items.filter((i) => i.id !== id) }));
          if (get().selectedItemId === id) set({ selectedItemId: null });
        },
        duplicateItem: (id) => {
          const src = get().plan?.items.find((i) => i.id === id);
          if (!src) return;
          const copy = { ...src, id: nanoid(8), x: src.x + 12, y: src.y + 12, shopResults: src.shopResults };
          edit((p) => ({ ...p, items: [...p.items, copy] }));
          set({ selectedItemId: copy.id });
        },

        addRoom: (polygon) => {
          const n = (get().plan?.rooms.length ?? 0) + 1;
          const room: Room = { id: nanoid(8), name: `Room ${n}`, type: "other", polygon };
          edit((p) => ({ ...p, rooms: [...p.rooms, room] }));
          set({ selectedRoomId: room.id, selectedItemId: null });
          return room;
        },
        updateRoom: (id, patch) =>
          edit((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
        removeRoom: (id) => {
          edit((p) => ({ ...p, rooms: p.rooms.filter((r) => r.id !== id) }));
          if (get().selectedRoomId === id) set({ selectedRoomId: null });
        },

        applyDetection: ({ ppi, wallThickness, rooms, openings, replace }) => {
          edit((p) => ({
            ...p,
            pxPerInch: p.pxPerInch ?? ppi,
            wallThickness,
            rooms: [...(replace ? [] : p.rooms), ...rooms.map((r) => ({ ...r, id: nanoid(8) }))],
            items: [
              ...(replace ? p.items.filter((i) => !OPENING_SHAPES.has(i.shape)) : p.items),
              ...openings.map((i) => ({ ...i, id: nanoid(8) })),
            ],
          }));
          set({ selectedItemId: null, selectedRoomId: null });
        },
      };
    },
    {
      partialize: (s) => ({ plan: s.plan }),
      equality: (a, b) => a.plan === b.plan,
      limit: 200,
    },
  ),
);

export const useHistory = () => usePlan.temporal.getState();

/** Pixels per inch for drawing, or null if the uploaded image hasn't been calibrated yet. */
export function effectivePpi(plan: Plan | null): number | null {
  if (!plan) return null;
  return plan.pxPerInch ?? (plan.image ? null : GRID_PPI);
}

// ---- Autosave (debounced) ----
let lastSaved = "";
let timer: ReturnType<typeof setTimeout> | undefined;

async function flush() {
  const plan = usePlan.getState().plan;
  if (!plan) return;
  const json = JSON.stringify(plan);
  if (json === lastSaved) return;
  usePlan.setState({ saveStatus: "saving" });
  try {
    await api.savePlan(plan);
    lastSaved = json;
    usePlan.setState({ saveStatus: "saved", saveError: null });
  } catch (e) {
    usePlan.setState({ saveStatus: "error", saveError: e instanceof Error ? e.message : String(e) });
  }
}

usePlan.subscribe((s, prev) => {
  if (!s.plan || s.plan === prev.plan) return;
  if (prev.plan && s.plan.id !== prev.plan.id) return;
  clearTimeout(timer);
  timer = setTimeout(flush, 600);
});

// Warn before closing the tab if the last edit hasn't reached the server yet.
window.addEventListener("beforeunload", (e) => {
  const plan = usePlan.getState().plan;
  if (plan && JSON.stringify(plan) !== lastSaved) {
    void flush();
    e.preventDefault();
  }
});

export function flushSave() {
  clearTimeout(timer);
  return flush();
}
