import { z } from "zod";
import { toSwRef } from "./sw";

// All lengths are inches. Positions are in plan inches from the image's top-left
// (image px / pxPerInch), so furniture keeps its real size when you recalibrate.

export const PointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof PointSchema>;

export const ROOM_TYPES = [
  "bedroom", "living", "dining", "kitchen", "bath", "office", "closet", "laundry", "hall", "entry", "garage", "other",
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

export const ITEM_STATUSES = ["existing", "planned", "to-buy"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const FIT_LABELS = ["fits", "tight", "too-big", "unknown"] as const;
export type FitLabel = (typeof FIT_LABELS)[number];

export const ProductSchema = z.object({
  name: z.string(),
  retailer: z.string(),
  url: z.string(),
  price: z.number().nullable(),
  currency: z.string(),
  widthIn: z.number().nullable(),
  depthIn: z.number().nullable(),
  heightIn: z.number().nullable(),
  color: z.string(),
  material: z.string(),
  whyItFits: z.string(),
  dimensionsSource: z.string(),
});
export type Product = z.infer<typeof ProductSchema>;

export const ScoredProductSchema = ProductSchema.extend({
  fit: z.enum(FIT_LABELS),
  fitNote: z.string(),
});
export type ScoredProduct = z.infer<typeof ScoredProductSchema>;

export const ShopResultsSchema = z.object({
  searchedAt: z.string(),
  query: z.object({ width: z.number(), depth: z.number(), height: z.number().nullable() }),
  summary: z.string(),
  products: z.array(ScoredProductSchema),
});
export type ShopResults = z.infer<typeof ShopResultsSchema>;

export const ItemSchema = z.object({
  id: z.string(),
  catalogKey: z.string(), // "custom" for user-drawn shapes
  label: z.string(),
  category: z.string(),
  shape: z.enum(["rect", "circle", "L", "U", "door", "window", "opening", "fixture"]),
  x: z.number(), // center, inches
  y: z.number(),
  width: z.number(),
  depth: z.number(),
  height: z.number().nullable(),
  rotation: z.number(), // degrees, clockwise
  flip: z.boolean().default(false), // doors: hinge on the right end instead of the left
  color: z.string(),
  status: z.enum(ITEM_STATUSES),
  notes: z.string(),
  shopResults: ShopResultsSchema.nullable(),
});
export type Item = z.infer<typeof ItemSchema>;

/**
 * One way of furnishing a room ("Current", "Mid-century", "Desk on the wall"). The active
 * version's furniture lives in plan.items like any other furniture; inactive versions keep
 * their furniture here until you switch to them.
 */
export const RoomVersionSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  brief: z.string(), // what was asked for, or how it came about
  concept: z.string(), // short description of the idea
  items: z.array(ItemSchema),
});
export type RoomVersion = z.infer<typeof RoomVersionSchema>;

const SwRefSchema = z.string().transform(toSwRef);

/** A room's paint, as Sherwin-Williams references ("SW 7008"). */
export const RoomPaintSchema = z.object({
  walls: SwRefSchema.nullable().default(null),
  accent: SwRefSchema.nullable().default(null),
  /** Which wall gets the accent color, as seen on the plan. */
  accentSide: z.enum(["top", "bottom", "left", "right"]).nullable().default(null),
  trim: SwRefSchema.nullable().default(null),
  ceiling: SwRefSchema.nullable().default(null),
});
export type RoomPaint = z.infer<typeof RoomPaintSchema>;
export const WALL_SIDES = ["top", "bottom", "left", "right"] as const;

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(ROOM_TYPES),
  /** Interior outline (inside faces of the walls), inches. */
  polygon: z.array(PointSchema),
  /**
   * Per edge (polygon[i] → polygon[i+1]): wall thickness in inches, or null where the
   * room is open to the next space. Missing for rooms traced by hand.
   */
  walls: z.array(z.number().nullable()).optional(),
  versions: z.array(RoomVersionSchema).optional(),
  activeVersionId: z.string().nullable().optional(),
  paint: RoomPaintSchema.optional(),
});
export type Room = z.infer<typeof RoomSchema>;

export const STYLE_OPTIONS = [
  "Mid-century modern",
  "Scandinavian",
  "Modern farmhouse",
  "Industrial",
  "Boho",
  "Traditional",
  "Minimalist",
  "Coastal",
  "Japandi",
  "Contemporary",
] as const;

export const StyleProfileSchema = z.object({
  styles: z.array(z.string()),
  /** Sherwin-Williams references ("SW 7008"). Older plans stored hex; those become the nearest SW color. */
  palette: z.array(z.string()).transform((a) => a.map(toSwRef)),
  avoid: z.string(),
  budgetNote: z.string(),
});
export type StyleProfile = z.infer<typeof StyleProfileSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  image: z
    .object({ url: z.string(), widthPx: z.number(), heightPx: z.number() })
    .nullable(),
  pxPerInch: z.number().nullable(),
  wallThickness: z.number().default(5), // inches; used for walls drawn in clean view
  rooms: z.array(RoomSchema),
  items: z.array(ItemSchema),
  style: StyleProfileSchema,
});
export type Plan = z.infer<typeof PlanSchema>;

export const PlanSummarySchema = PlanSchema.pick({ id: true, name: true, updatedAt: true }).extend({
  hasImage: z.boolean(),
});
export type PlanSummary = z.infer<typeof PlanSummarySchema>;

// ---- API request/response shapes ----

export const ShopRequestSchema = z.object({
  label: z.string(),
  category: z.string(),
  width: z.number().positive(),
  depth: z.number().positive(),
  height: z.number().positive().nullable(),
  toleranceUnder: z.number().min(0).default(2),
  toleranceOver: z.number().min(0).default(1),
  maxPrice: z.number().positive().nullable().default(null),
  notes: z.string().default(""),
  roomType: z.string().nullable().default(null),
  /** The room's paint, described ("walls SW 7008 Alabaster (#edeae0); …"), or "". */
  roomPaint: z.string().default(""),
  style: StyleProfileSchema,
});
export type ShopRequest = z.infer<typeof ShopRequestSchema>;

export const SuggestionSchema = z.object({
  category: z.string(),
  label: z.string(),
  widthIn: z.number(),
  depthIn: z.number(),
  reason: z.string(),
  placementHint: z.string(),
  priority: z.enum(["essential", "recommended", "nice-to-have"]),
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

export const SuggestRoomRequestSchema = z.object({
  room: z.object({
    name: z.string(),
    type: z.string(),
    widthIn: z.number(),
    depthIn: z.number(),
    areaSqFt: z.number(),
    paint: z.string().default(""),
  }),
  items: z.array(
    z.object({
      label: z.string(),
      category: z.string(),
      widthIn: z.number(),
      depthIn: z.number(),
      status: z.string(),
      position: z.string(),
    }),
  ),
  style: StyleProfileSchema,
});
export type SuggestRoomRequest = z.infer<typeof SuggestRoomRequestSchema>;

export const SuggestRoomResponseSchema = z.object({
  summary: z.string(),
  suggestions: z.array(SuggestionSchema),
});
export type SuggestRoomResponse = z.infer<typeof SuggestRoomResponseSchema>;

export function emptyStyle(): StyleProfile {
  return { styles: [], palette: [], avoid: "", budgetNote: "" };
}

// ---- Floor plan auto-detection (coordinates are pixels of the image sent to Claude) ----

/** Built-in features of a home, kept and redrawn from the floor plan. Stored as items with shape "fixture". */
export const FIXTURE_KINDS = [
  "counter", "island", "sink", "range", "fridge", "dishwasher",
  "toilet", "tub", "shower", "vanity", "washer", "dryer", "water heater",
  "fireplace", "stairs", "shelf", "other",
] as const;
export type FixtureKind = (typeof FIXTURE_KINDS)[number];

const Px = z.object({ x: z.number(), y: z.number() });

export const RawDetectionSchema = z.object({
  rooms: z.array(
    z.object({
      name: z.string(),
      type: z.enum(ROOM_TYPES),
      polygon: z.array(Px),
      labeledWidthIn: z.number().nullable(),
      labeledDepthIn: z.number().nullable(),
    }),
  ),
  doors: z.array(
    z.object({
      kind: z.enum(["swing", "double", "sliding", "pocket", "bifold", "opening", "garage"]),
      hinge: Px,
      otherJamb: Px,
      swingToward: Px.nullable(),
    }),
  ),
  windows: z.array(z.object({ start: Px, end: Px })),
  fixtures: z.array(
    z.object({
      kind: z.enum(FIXTURE_KINDS),
      box: z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() }),
      against: z.enum(["top", "bottom", "left", "right", "none"]),
    }),
  ),
  dimensionLines: z.array(z.object({ start: Px, end: Px, text: z.string(), inches: z.number() })),
  notes: z.string(),
});
export type RawDetection = z.infer<typeof RawDetectionSchema>;

export const DetectRequestSchema = z.object({
  image: z.string().min(100), // base64, no data: prefix
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type DetectRequest = z.infer<typeof DetectRequestSchema>;

// ---- Room redesign and chat ----
// Coordinates are inches in the room's own frame: origin at the top-left of its bounding box,
// x to the right, y down. Rotation is which way an item's front faces: 0 = toward the bottom
// wall, 90 = toward the left, 180 = toward the top, 270 = toward the right.

const LocalItem = z.object({
  label: z.string(),
  category: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  depth: z.number(),
  rotation: z.number(),
});

export const RoomContextSchema = z.object({
  room: z.object({
    name: z.string(),
    type: z.string(),
    widthIn: z.number(),
    depthIn: z.number(),
    outline: z.array(PointSchema),
    edges: z.array(z.object({ side: z.string(), from: PointSchema, to: PointSchema, wall: z.boolean() })),
    paint: z.string().default(""),
  }),
  openings: z.array(z.object({
    kind: z.string(), label: z.string(), side: z.string(), x: z.number(), y: z.number(), width: z.number(),
    swingsInto: z.enum(["room", "away", "none"]),
  })),
  fixtures: z.array(LocalItem),
  furniture: z.array(LocalItem.extend({ id: z.string(), status: z.string() })),
  neighbors: z.array(z.object({ name: z.string(), type: z.string(), side: z.string(), paint: z.string().default("") })),
  house: z.array(z.object({ name: z.string(), type: z.string(), areaSqFt: z.number(), paint: z.string().default("") })),
  style: StyleProfileSchema,
});
export type RoomContext = z.infer<typeof RoomContextSchema>;

/** A piece Claude places: from the catalog (catalogKey) or custom (catalogKey "custom"). */
export const PlacedItemSchema = z.object({
  catalogKey: z.string(),
  label: z.string(),
  category: z.string(),
  shape: z.enum(["rect", "circle", "L", "U"]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  depth: z.number(),
  rotation: z.number(),
  keepId: z.string().nullable(), // id of an existing piece being reused, else null (a new piece)
  why: z.string(),
});
export type PlacedItem = z.infer<typeof PlacedItemSchema>;

export const RedesignRequestSchema = z.object({
  context: RoomContextSchema,
  brief: z.string(),
  keepIds: z.array(z.string()),
  principles: z.array(z.string()),
  count: z.number().int().min(1).max(3),
});
export type RedesignRequest = z.infer<typeof RedesignRequestSchema>;

export const RedesignResponseSchema = z.object({
  layouts: z.array(z.object({
    name: z.string(),
    concept: z.string(),
    items: z.array(PlacedItemSchema),
  })),
});
export type RedesignResponse = z.infer<typeof RedesignResponseSchema>;

export const RoomChatRequestSchema = z.object({
  context: RoomContextSchema,
  versionName: z.string(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })),
  message: z.string(),
});
export type RoomChatRequest = z.infer<typeof RoomChatRequestSchema>;

export const RoomChatResponseSchema = z.object({
  reply: z.string(),
  /** Changes to the room's furniture. Empty when the answer is just advice. */
  changes: z.array(z.object({
    op: z.enum(["add", "update", "remove"]),
    id: z.string().nullable(), // existing piece for update/remove
    item: PlacedItemSchema.nullable(), // full new state for add/update
  })),
});
export type RoomChatResponse = z.infer<typeof RoomChatResponseSchema>;
