import { z } from "zod";

// All lengths are inches. Positions are in plan inches from the image's top-left
// (image px / pxPerInch), so furniture keeps its real size when you recalibrate.

export const PointSchema = z.object({ x: z.number(), y: z.number() });
export type Point = z.infer<typeof PointSchema>;

export const ROOM_TYPES = ["bedroom", "living", "dining", "office", "kitchen", "bath", "hall", "other"] as const;
export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(ROOM_TYPES),
  polygon: z.array(PointSchema),
});
export type Room = z.infer<typeof RoomSchema>;
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
  shape: z.enum(["rect", "circle", "L", "U", "door", "window"]),
  x: z.number(), // center, inches
  y: z.number(),
  width: z.number(),
  depth: z.number(),
  height: z.number().nullable(),
  rotation: z.number(), // degrees, clockwise
  color: z.string(),
  status: z.enum(ITEM_STATUSES),
  notes: z.string(),
  shopResults: ShopResultsSchema.nullable(),
});
export type Item = z.infer<typeof ItemSchema>;

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
  palette: z.array(z.string()),
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
