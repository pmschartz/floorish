import type { FixtureKind, Item } from "../../shared/schemas";
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
/** Room beside a car or truck to open its doors and get out. */
const carDoors = (dist: number): ClearanceRule[] => [
  { side: "left", dist, why: "room to open the doors and get out" },
  { side: "right", dist, why: "room to open the doors and get out" },
];
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
  { key: "sectional-u", label: "Sectional (U)", category: "sectional", group: "Living", shape: "U", width: 132, depth: 96, height: 34 },
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

  // Gym (the user stands or sits facing the front, +y at rotation 0)
  { key: "treadmill", label: "Treadmill", category: "treadmill", group: "Gym", shape: "rect", width: 35, depth: 80, height: 58,
    clearances: [{ side: "back", dist: 72, why: "safety zone behind the belt" }, { side: "left", dist: 18, why: "room to step on and off" }, { side: "right", dist: 18, why: "room to step on and off" }] },
  { key: "exercise-bike", label: "Exercise bike", category: "exercise bike", group: "Gym", shape: "rect", width: 24, depth: 48, height: 48,
    clearances: [{ side: "left", dist: 18, why: "room to get on and off" }, { side: "right", dist: 18, why: "room to get on and off" }] },
  { key: "elliptical", label: "Elliptical", category: "elliptical", group: "Gym", shape: "rect", width: 30, depth: 78, height: 66,
    clearances: [{ side: "back", dist: 24, why: "room for the pedals' stride" }, { side: "left", dist: 18, why: "room to step on and off" }, { side: "right", dist: 18, why: "room to step on and off" }] },
  { key: "rowing-machine", label: "Rowing machine", category: "rowing machine", group: "Gym", shape: "rect", width: 24, depth: 96, height: 20,
    clearances: [{ side: "left", dist: 24, why: "room for the handle and your arms" }, { side: "right", dist: 24, why: "room for the handle and your arms" }] },
  { key: "weight-bench", label: "Weight bench", category: "weight bench", group: "Gym", shape: "rect", width: 24, depth: 54, height: 18,
    clearances: [{ side: "left", dist: 30, why: "room to load weights and spot" }, { side: "right", dist: 30, why: "room to load weights and spot" }] },
  { key: "power-rack", label: "Power rack", category: "power rack", group: "Gym", shape: "rect", width: 50, depth: 50, height: 90,
    clearances: front(48, "room to walk the bar out") },
  { key: "home-gym", label: "Home gym (cable)", category: "home gym", group: "Gym", shape: "rect", width: 50, depth: 80, height: 83,
    clearances: front(36, "room to use the cables") },
  { key: "dumbbell-rack", label: "Dumbbell rack", category: "dumbbell rack", group: "Gym", shape: "rect", width: 48, depth: 20, height: 32,
    clearances: front(30, "room to lift weights off the rack") },
  { key: "yoga-mat", label: "Yoga / exercise mat", category: "exercise mat", group: "Gym", shape: "rect", width: 24, depth: 72, height: null,
    clearances: allSides(12, "room to stretch", ["rug"]) },
  { key: "punching-bag", label: "Punching bag", category: "punching bag", group: "Gym", shape: "circle", width: 24, depth: 24, height: null,
    clearances: allSides(30, "room for the bag to swing and to move around it") },

  // Plants
  { key: "plant-small", label: "Floor plant, small", category: "plant", group: "Plants", shape: "circle", width: 14, depth: 14, height: 30 },
  { key: "plant-medium", label: "Floor plant, medium", category: "plant", group: "Plants", shape: "circle", width: 20, depth: 20, height: 48 },
  { key: "plant-large", label: "Floor plant, large (fig, palm)", category: "plant", group: "Plants", shape: "circle", width: 28, depth: 28, height: 72 },
  { key: "plant-tree", label: "Indoor tree", category: "plant", group: "Plants", shape: "circle", width: 36, depth: 36, height: 84 },
  { key: "plant-stand", label: "Plant stand", category: "plant stand", group: "Plants", shape: "circle", width: 16, depth: 16, height: 30 },
  { key: "planter-box", label: "Planter box", category: "planter", group: "Plants", shape: "rect", width: 36, depth: 12, height: 24 },
  { key: "plant-shelf", label: "Plant shelf", category: "plant shelf", group: "Plants", shape: "rect", width: 36, depth: 14, height: 60 },

  // Garage (vehicles face +y: the front of the car is the front of the shape). Sizes are
  // typical bodies without mirrors; doors need about 30" to open and let you out.
  { key: "car-compact", label: "Compact car", category: "car", group: "Garage", shape: "rect", width: 70, depth: 178, height: 57, clearances: carDoors(30) },
  { key: "car-sedan", label: "Midsize sedan", category: "car", group: "Garage", shape: "rect", width: 73, depth: 192, height: 57, clearances: carDoors(30) },
  { key: "car-suv", label: "SUV", category: "car", group: "Garage", shape: "rect", width: 78, depth: 196, height: 70, clearances: carDoors(30) },
  { key: "car-minivan", label: "Minivan", category: "car", group: "Garage", shape: "rect", width: 79, depth: 204, height: 70, clearances: carDoors(30) },
  { key: "truck-pickup", label: "Pickup truck (crew cab)", category: "truck", group: "Garage", shape: "rect", width: 80, depth: 232, height: 76,
    clearances: [...carDoors(30), { side: "back", dist: 30, why: "room to drop the tailgate" }] },
  { key: "motorcycle", label: "Motorcycle", category: "motorcycle", group: "Garage", shape: "rect", width: 32, depth: 86, height: 45,
    clearances: [{ side: "left", dist: 24, why: "room to get on and off" }] },
  { key: "bicycle", label: "Bicycle", category: "bicycle", group: "Garage", shape: "rect", width: 24, depth: 70, height: 42 },
  { key: "riding-mower", label: "Riding mower", category: "mower", group: "Garage", shape: "rect", width: 46, depth: 68, height: 44 },
  { key: "push-mower", label: "Push mower", category: "mower", group: "Garage", shape: "rect", width: 22, depth: 56, height: 40 },
  { key: "snowblower", label: "Snowblower", category: "snowblower", group: "Garage", shape: "rect", width: 28, depth: 56, height: 44 },
  { key: "workbench-6", label: "Workbench 6'", category: "workbench", group: "Garage", shape: "rect", width: 72, depth: 30, height: 36,
    clearances: front(36, "room to stand and work") },
  { key: "workbench-8", label: "Workbench 8'", category: "workbench", group: "Garage", shape: "rect", width: 96, depth: 30, height: 36,
    clearances: front(36, "room to stand and work") },
  { key: "tool-chest", label: "Rolling tool chest", category: "tool chest", group: "Garage", shape: "rect", width: 41, depth: 24, height: 40,
    clearances: front(30, "room to open the drawers") },
  { key: "tool-cabinet", label: "Tool cabinet (tall)", category: "tool chest", group: "Garage", shape: "rect", width: 56, depth: 24, height: 72,
    clearances: front(30, "room to open the drawers") },
  { key: "garage-shelving", label: "Garage shelving", category: "shelving", group: "Garage", shape: "rect", width: 48, depth: 24, height: 72,
    clearances: front(30, "room to reach the shelves") },
  { key: "storage-cabinet", label: "Storage cabinet", category: "storage cabinet", group: "Garage", shape: "rect", width: 36, depth: 24, height: 72,
    clearances: front(30, "room to open the doors") },
  { key: "table-saw", label: "Table saw", category: "table saw", group: "Garage", shape: "rect", width: 44, depth: 30, height: 34,
    clearances: [{ side: "front", dist: 48, why: "room to feed boards in" }, { side: "back", dist: 48, why: "room for boards coming out" }] },
  { key: "chest-freezer", label: "Chest freezer", category: "freezer", group: "Garage", shape: "rect", width: 48, depth: 28, height: 34,
    clearances: front(24, "room to stand at the open lid") },
  { key: "garage-fridge", label: "Spare fridge", category: "refrigerator", group: "Garage", shape: "rect", width: 30, depth: 32, height: 67,
    clearances: front(36, "room to open the door") },
  { key: "trash-cart", label: "Trash or recycling cart", category: "trash cart", group: "Garage", shape: "rect", width: 29, depth: 35, height: 46 },
  { key: "kayak", label: "Kayak (on a rack)", category: "kayak", group: "Garage", shape: "rect", width: 28, depth: 120, height: null },

  // Rugs
  { key: "rug-5x8", label: "Rug 5×8", category: "rug", group: "Rugs", shape: "rect", width: 60, depth: 96, height: null },
  { key: "rug-8x10", label: "Rug 8×10", category: "rug", group: "Rugs", shape: "rect", width: 96, depth: 120, height: null },
  { key: "rug-9x12", label: "Rug 9×12", category: "rug", group: "Rugs", shape: "rect", width: 108, depth: 144, height: null },
  { key: "rug-round", label: "Round rug 6'", category: "rug", group: "Rugs", shape: "circle", width: 72, depth: 72, height: null },

  // Doors, windows and openings (they snap into the nearest wall)
  { key: "door-24", label: "Door 24\"", category: "door", group: "Doors & windows", shape: "door", width: 24, depth: 2, height: null },
  { key: "door-30", label: "Door 30\"", category: "door", group: "Doors & windows", shape: "door", width: 30, depth: 2, height: null },
  { key: "door-32", label: "Door 32\"", category: "door", group: "Doors & windows", shape: "door", width: 32, depth: 2, height: null },
  { key: "door-36", label: "Door 36\"", category: "door", group: "Doors & windows", shape: "door", width: 36, depth: 2, height: null },
  { key: "double-door-60", label: "Double door 60\"", category: "double door", group: "Doors & windows", shape: "door", width: 60, depth: 2, height: null },
  { key: "sliding-door-60", label: "Sliding door 60\"", category: "sliding door", group: "Doors & windows", shape: "opening", width: 60, depth: 4, height: null },
  { key: "sliding-door-72", label: "Sliding door 72\"", category: "sliding door", group: "Doors & windows", shape: "opening", width: 72, depth: 4, height: null },
  { key: "pocket-door-30", label: "Pocket door 30\"", category: "pocket door", group: "Doors & windows", shape: "opening", width: 30, depth: 4, height: null },
  { key: "bifold-door-36", label: "Bifold door 36\"", category: "bifold door", group: "Doors & windows", shape: "opening", width: 36, depth: 4, height: null },
  { key: "bifold-door-48", label: "Bifold door 48\"", category: "bifold door", group: "Doors & windows", shape: "opening", width: 48, depth: 4, height: null },
  { key: "opening-36", label: "Opening 36\"", category: "opening", group: "Doors & windows", shape: "opening", width: 36, depth: 4, height: null },
  { key: "opening-72", label: "Wide opening 72\"", category: "opening", group: "Doors & windows", shape: "opening", width: 72, depth: 4, height: null },
  { key: "garage-door-96", label: "Garage door 8'", category: "garage door", group: "Doors & windows", shape: "opening", width: 96, depth: 6, height: null },
  { key: "garage-door-192", label: "Garage door 16'", category: "garage door", group: "Doors & windows", shape: "opening", width: 192, depth: 6, height: null },
  { key: "window", label: "Window 36\"", category: "window", group: "Doors & windows", shape: "window", width: 36, depth: 4, height: null },
  { key: "window-60", label: "Window 60\"", category: "window", group: "Doors & windows", shape: "window", width: 60, depth: 4, height: null },
];

export const CUSTOM_SHAPES: CatalogEntry[] = [
  { key: "custom-rect", label: "Rectangle", category: "", group: "Custom", shape: "rect", width: 36, depth: 24, height: null },
  { key: "custom-circle", label: "Circle", category: "", group: "Custom", shape: "circle", width: 30, depth: 30, height: null },
  { key: "custom-L", label: "L-shape", category: "", group: "Custom", shape: "L", width: 72, depth: 60, height: null },
  { key: "custom-U", label: "U-shape", category: "", group: "Custom", shape: "U", width: 96, depth: 72, height: null },
];

export const FIXTURE_LABEL: Record<FixtureKind, string> = {
  counter: "Counter",
  island: "Island",
  sink: "Sink",
  range: "Range",
  fridge: "Refrigerator",
  dishwasher: "Dishwasher",
  toilet: "Toilet",
  tub: "Bathtub",
  shower: "Shower",
  vanity: "Vanity",
  washer: "Washer",
  dryer: "Dryer",
  "water heater": "Water heater",
  fireplace: "Fireplace",
  stairs: "Stairs",
  shelf: "Shelving",
  other: "Fixture",
};

/** Built-in features (auto-detect adds these too). Width runs along the wall; the front faces away from it. */
export const FIXTURES: CatalogEntry[] = (
  [
    ["toilet", 20, 28], ["tub", 60, 30], ["shower", 36, 36], ["vanity", 48, 22], ["sink", 33, 22],
    ["counter", 96, 25], ["island", 72, 36], ["range", 30, 26], ["fridge", 36, 30], ["dishwasher", 24, 24],
    ["washer", 27, 30], ["dryer", 27, 30], ["water heater", 24, 24], ["fireplace", 60, 20], ["stairs", 36, 120], ["shelf", 48, 14],
  ] as Array<[FixtureKind, number, number]>
).map(([kind, width, depth]) => ({
  key: `fixture-${kind.replace(" ", "-")}`, label: FIXTURE_LABEL[kind], category: kind, group: "Fixtures", shape: "fixture" as const,
  width, depth, height: null,
}));

export const ALL_ENTRIES: CatalogEntry[] = [...CUSTOM_SHAPES, ...CATALOG, ...FIXTURES];

/** Kinds of door, window and opening (not offered as furniture categories). */
export const OPENING_CATEGORIES = new Set(["door", "double door", "sliding door", "pocket door", "bifold door", "opening", "garage door", "window"]);

/**
 * What kind of opening an item is. Older detected openings kept the kind only in their label
 * ("Sliding door"), so fall back to that.
 */
export function openingKind(item: { category: string; label: string }): string {
  const c = item.category.toLowerCase();
  if (c !== "opening") return c;
  const l = item.label.toLowerCase();
  return OPENING_CATEGORIES.has(l) ? l : "opening";
}

/** Categories offered when labeling a custom shape. */
export const CATEGORIES = Array.from(new Set(CATALOG.map((c) => c.category)))
  .filter((c) => !OPENING_CATEGORIES.has(c))
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


export const PASSIVE_CATEGORIES = new Set(["rug", "door", "window", "opening", "double door", "sliding door", "pocket door", "bifold door", "garage door"]);
