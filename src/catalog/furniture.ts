import type { Item } from "../../shared/schemas";
import type { Side } from "../model/geometry";

export interface ClearanceRule {
  side: Side;
  dist: number; // inches
  why: string;
  /** Categories allowed inside this zone (e.g. chairs around a dining table). */
  allow?: string[];
}

export interface CatalogEntry {
  key: string;
  label: string;
  category: string;
  group: string;
  shape: Item["shape"];
  width: number;
  depth: number;
  height: number | null;
  clearances?: ClearanceRule[];
}

const bedSides = (dist = 24): ClearanceRule[] => [
  { side: "left", dist, why: "room to get in and out and make the bed", allow: ["nightstand", "rug"] },
  { side: "right", dist, why: "room to get in and out and make the bed", allow: ["nightstand", "rug"] },
  { side: "front", dist, why: "walkway at the foot of the bed", allow: ["bench", "rug"] },
];
const front = (dist: number, why: string, allow?: string[]): ClearanceRule[] => [{ side: "front", dist, why, allow }];
const allSides = (dist: number, why: string, allow?: string[]): ClearanceRule[] =>
  (["front", "back", "left", "right"] as Side[]).map((side) => ({ side, dist, why, allow }));

export const CATALOG: CatalogEntry[] = [
  // Bedroom
  { key: "bed-twin", label: "Twin bed", category: "bed", group: "Bedroom", shape: "rect", width: 38, depth: 75, height: null, clearances: bedSides(24) },
  { key: "bed-full", label: "Full bed", category: "bed", group: "Bedroom", shape: "rect", width: 54, depth: 75, height: null, clearances: bedSides(24) },
  { key: "bed-queen", label: "Queen bed", category: "bed", group: "Bedroom", shape: "rect", width: 60, depth: 80, height: null, clearances: bedSides(24) },
  { key: "bed-king", label: "King bed", category: "bed", group: "Bedroom", shape: "rect", width: 76, depth: 80, height: null, clearances: bedSides(24) },
  { key: "bed-calking", label: "Cal king bed", category: "bed", group: "Bedroom", shape: "rect", width: 72, depth: 84, height: null, clearances: bedSides(24) },
  { key: "nightstand", label: "Nightstand", category: "nightstand", group: "Bedroom", shape: "rect", width: 24, depth: 16, height: 26 },
  { key: "dresser", label: "Dresser", category: "dresser", group: "Bedroom", shape: "rect", width: 60, depth: 18, height: 32, clearances: front(36, "space to open drawers and stand") },
  { key: "chest", label: "Tall chest", category: "dresser", group: "Bedroom", shape: "rect", width: 36, depth: 18, height: 50, clearances: front(36, "space to open drawers and stand") },
  { key: "wardrobe", label: "Wardrobe", category: "wardrobe", group: "Bedroom", shape: "rect", width: 40, depth: 24, height: 72, clearances: front(36, "space to open the doors") },
  { key: "bench", label: "Bed bench", category: "bench", group: "Bedroom", shape: "rect", width: 48, depth: 16, height: 18 },

  // Living
  { key: "sofa", label: "Sofa", category: "sofa", group: "Living", shape: "rect", width: 84, depth: 36, height: 34, clearances: front(14, "legroom; coffee tables work best 14–18\" from the sofa", ["coffee table", "rug", "ottoman"]) },
  { key: "loveseat", label: "Loveseat", category: "sofa", group: "Living", shape: "rect", width: 60, depth: 36, height: 34, clearances: front(14, "legroom", ["coffee table", "rug", "ottoman"]) },
  { key: "sectional", label: "Sectional (L)", category: "sectional", group: "Living", shape: "L", width: 108, depth: 84, height: 34 },
  { key: "armchair", label: "Armchair", category: "armchair", group: "Living", shape: "rect", width: 32, depth: 34, height: 32 },
  { key: "ottoman", label: "Ottoman", category: "ottoman", group: "Living", shape: "rect", width: 24, depth: 24, height: 17 },
  { key: "coffee-table", label: "Coffee table", category: "coffee table", group: "Living", shape: "rect", width: 48, depth: 24, height: 18 },
  { key: "coffee-round", label: "Round coffee table", category: "coffee table", group: "Living", shape: "circle", width: 36, depth: 36, height: 18 },
  { key: "side-table", label: "Side table", category: "side table", group: "Living", shape: "rect", width: 20, depth: 20, height: 24 },
  { key: "tv-stand", label: "TV stand", category: "tv stand", group: "Living", shape: "rect", width: 60, depth: 16, height: 22 },
  { key: "bookcase", label: "Bookcase", category: "bookcase", group: "Living", shape: "rect", width: 36, depth: 12, height: 72, clearances: front(30, "room to stand and browse") },
  { key: "console", label: "Console table", category: "console table", group: "Living", shape: "rect", width: 48, depth: 14, height: 30 },

  // Dining
  { key: "dining-4", label: "Dining table (4)", category: "dining table", group: "Dining", shape: "rect", width: 48, depth: 30, height: 30, clearances: allSides(36, "room to pull out chairs", ["dining chair", "rug"]) },
  { key: "dining-6", label: "Dining table (6)", category: "dining table", group: "Dining", shape: "rect", width: 72, depth: 36, height: 30, clearances: allSides(36, "room to pull out chairs", ["dining chair", "rug"]) },
  { key: "dining-8", label: "Dining table (8)", category: "dining table", group: "Dining", shape: "rect", width: 96, depth: 40, height: 30, clearances: allSides(36, "room to pull out chairs", ["dining chair", "rug"]) },
  { key: "dining-round", label: "Round dining table", category: "dining table", group: "Dining", shape: "circle", width: 48, depth: 48, height: 30, clearances: allSides(36, "room to pull out chairs", ["dining chair", "rug"]) },
  { key: "dining-chair", label: "Dining chair", category: "dining chair", group: "Dining", shape: "rect", width: 18, depth: 20, height: 34 },
  { key: "sideboard", label: "Sideboard", category: "sideboard", group: "Dining", shape: "rect", width: 60, depth: 18, height: 32, clearances: front(36, "space to open doors and walk past") },

  // Office
  { key: "desk", label: "Desk", category: "desk", group: "Office", shape: "rect", width: 60, depth: 30, height: 30, clearances: front(36, "room for the chair to roll back", ["office chair", "rug"]) },
  { key: "desk-small", label: "Small desk", category: "desk", group: "Office", shape: "rect", width: 42, depth: 22, height: 30, clearances: front(36, "room for the chair to roll back", ["office chair", "rug"]) },
  { key: "office-chair", label: "Office chair", category: "office chair", group: "Office", shape: "circle", width: 26, depth: 26, height: null },
  { key: "file-cabinet", label: "File cabinet", category: "file cabinet", group: "Office", shape: "rect", width: 15, depth: 22, height: 28, clearances: front(30, "room to open drawers") },

  // Rugs
  { key: "rug-5x8", label: "Rug 5×8", category: "rug", group: "Rugs", shape: "rect", width: 60, depth: 96, height: null },
  { key: "rug-8x10", label: "Rug 8×10", category: "rug", group: "Rugs", shape: "rect", width: 96, depth: 120, height: null },
  { key: "rug-9x12", label: "Rug 9×12", category: "rug", group: "Rugs", shape: "rect", width: 108, depth: 144, height: null },
  { key: "rug-round", label: "Round rug 6'", category: "rug", group: "Rugs", shape: "circle", width: 72, depth: 72, height: null },

  // Openings
  { key: "door-30", label: "Door 30\"", category: "door", group: "Doors & windows", shape: "door", width: 30, depth: 2, height: null },
  { key: "door-36", label: "Door 36\"", category: "door", group: "Doors & windows", shape: "door", width: 36, depth: 2, height: null },
  { key: "window", label: "Window", category: "window", group: "Doors & windows", shape: "window", width: 36, depth: 4, height: null },
];

export const CUSTOM_SHAPES: CatalogEntry[] = [
  { key: "custom-rect", label: "Rectangle", category: "", group: "Custom", shape: "rect", width: 36, depth: 24, height: null },
  { key: "custom-circle", label: "Circle", category: "", group: "Custom", shape: "circle", width: 30, depth: 30, height: null },
  { key: "custom-L", label: "L-shape", category: "", group: "Custom", shape: "L", width: 72, depth: 60, height: null },
];

/** Categories offered when labeling a custom shape. */
export const CATEGORIES = Array.from(new Set(CATALOG.map((c) => c.category)))
  .filter((c) => c !== "door" && c !== "window")
  .concat(["lamp", "plant", "mirror", "storage", "cabinet", "shelf", "piano", "other"])
  .sort();

export function catalogEntry(key: string): CatalogEntry | undefined {
  return CATALOG.find((c) => c.key === key);
}

/** Clearance rules for an item: by catalog key, else by category (so a custom "desk" gets desk rules). */
export function clearancesFor(item: Pick<Item, "catalogKey" | "category">): ClearanceRule[] {
  const byKey = catalogEntry(item.catalogKey);
  if (byKey) return byKey.clearances ?? [];
  const byCat = CATALOG.find((c) => c.category === item.category && c.clearances);
  return byCat?.clearances ?? [];
}

export const STATUS_COLORS: Record<Item["status"], { fill: string; stroke: string }> = {
  existing: { fill: "rgba(120,120,128,0.35)", stroke: "#5f5f66" },
  planned: { fill: "rgba(59,130,246,0.30)", stroke: "#2563eb" },
  "to-buy": { fill: "rgba(245,158,11,0.35)", stroke: "#d97706" },
};

export const PASSIVE_CATEGORIES = new Set(["rug", "door", "window"]);
