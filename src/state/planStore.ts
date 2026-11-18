import { nanoid } from "nanoid";
import { temporal } from "zundo";
import { create } from "zustand";
import type { Item, Plan, Point, Room, StyleProfile } from "../../shared/schemas";
import { api, setApiPlan } from "../api/client";
import { snapOpeningToWall } from "../detect/walls";
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

  /** Any change to the plan as one undoable step (room versions, redesigns, chat edits). */
  applyPlan: (fn: (p: Plan) => Plan) => void;

  /** Add (or swap in) rooms, doors and windows found by auto-detect, as one undoable step. */
  applyDetection: (d: {
    ppi: number;
    wallThickness: number;
    rooms: Omit<Room, "id">[];
    openings: Omit<Item, "id">[]; // doors, windows, openings and fixtures
    replace: boolean;
  }) => void;
}

// Parts of the building itself (replaced when you re-run auto-detect), as opposed to furniture.
const BUILT_IN_SHAPES = new Set<Item["shape"]>(["door", "window", "opening", "fixture"]);

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
          setApiPlan(plan.id);
          set({ plan, selectedItemId: null, selectedRoomId: null, tool: "select", saveStatus: "saved" });
          usePlan.temporal.getState().clear();
          lastSaved = JSON.stringify(plan);
        },
        closePlan: () => {
          setApiPlan("");
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
          edit((p) => ({ ...p, items: [...p.items, snapOpeningToWall(item, p.rooms)] }));
          set({ selectedItemId: item.id, selectedRoomId: null });
          return item;
        },
        updateItem: (id, patch) =>
          edit((p) => ({
            ...p,
            items: p.items.map((i) => {
              if (i.id !== id) return i;
              const next = { ...i, ...patch };
              // Moving a door, window or opening drops it into the nearest wall.
              return "x" in patch || "y" in patch ? snapOpeningToWall(next, p.rooms) : next;
            }),
          })),
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

        applyPlan: (fn) => edit(fn),

        applyDetection: ({ ppi, wallThickness, rooms, openings, replace }) => {
          edit((p) => ({
            ...p,
            pxPerInch: p.pxPerInch ?? ppi,
            wallThickness,
            rooms: [...(replace ? [] : p.rooms), ...rooms.map((r) => ({ ...r, id: nanoid(8) }))],
            items: [
              ...(replace ? p.items.filter((i) => !BUILT_IN_SHAPES.has(i.shape)) : p.items),
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

// Warn before closing the tab if the last edit hasn't reached the server yet. (Not in tests.)
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => {
    const plan = usePlan.getState().plan;
    if (plan && JSON.stringify(plan) !== lastSaved) {
      void flush();
      e.preventDefault();
    }
  });
}

export function flushSave() {
  clearTimeout(timer);
  return flush();
}

// ---- Claude's answers survive Undo and Redo ----
// Room chats, What's missing answers and shop results were paid for, so stepping back through
// your edits never throws them away, and saving one doesn't add an Undo step.

interface Sticky {
  rooms: Map<string, Pick<Room, "chat" | "suggestions">>;
  items: Map<string, Item["shopResults"]>;
}

function stickyOf(plan: Plan): Sticky {
  return {
    rooms: new Map(plan.rooms.map((r) => [r.id, { chat: r.chat, suggestions: r.suggestions }])),
    items: new Map(plan.items.filter((i) => i.shopResults).map((i) => [i.id, i.shopResults])),
  };
}

function withSticky(plan: Plan, s: Sticky): Plan {
  return {
    ...plan,
    rooms: plan.rooms.map((r) => (s.rooms.has(r.id) ? { ...r, ...s.rooms.get(r.id) } : r)),
    items: plan.items.map((i) => (s.items.has(i.id) ? { ...i, shopResults: s.items.get(i.id) ?? null } : i)),
  };
}

function step(dir: "undo" | "redo") {
  const before = usePlan.getState().plan;
  const t = usePlan.temporal.getState();
  if (dir === "undo") t.undo(); else t.redo();
  const after = usePlan.getState().plan;
  if (!before || !after) return;
  t.pause();
  usePlan.setState({ plan: withSticky(after, stickyOf(before)) });
  t.resume();
}

export const undo = () => step("undo");
export const redo = () => step("redo");

/** Save one of Claude's answers into the plan without adding an Undo step. */
export function keepResult(fn: (p: Plan) => Plan) {
  const p = usePlan.getState().plan;
  if (!p) return;
  const t = usePlan.temporal.getState();
  t.pause();
  usePlan.setState({ plan: fn(p) });
  t.resume();
}

/** Patch one room's saved Claude answers (chat, What's missing). */
export const keepRoomResult = (roomId: string, patch: Pick<Room, "chat"> | Pick<Room, "suggestions">) =>
  keepResult((p) => ({ ...p, rooms: p.rooms.map((r) => (r.id === roomId ? { ...r, ...patch } : r)) }));
