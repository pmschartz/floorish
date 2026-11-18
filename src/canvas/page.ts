import type { Plan } from "../../shared/schemas";
import { itemCorners } from "../model/geometry";

/** The blank grid's size (inches, 50' × 40') for plans without an image. */
export const GRID_EXTENT = { w: 600, h: 480 };

/** Space left around the rooms on the clean-view page (inches). */
const MARGIN_IN = 36;

export interface Page { x: number; y: number; w: number; h: number }

/**
 * The area of the canvas the plan occupies, in image pixels. Normally the floor plan image (or
 * the blank grid). In clean view it hugs the rooms, their walls and the furniture, with a
 * margin, so deleting a room (say, the garage) doesn't leave an empty stretch of page.
 */
export function planPage(plan: Plan, ppi: number | null, clean: boolean): Page {
  const scale = ppi ?? 2;
  const full = plan.image
    ? { x: 0, y: 0, w: plan.image.widthPx, h: plan.image.heightPx }
    : { x: 0, y: 0, w: GRID_EXTENT.w * scale, h: GRID_EXTENT.h * scale };
  if (!clean || !ppi || plan.rooms.length === 0) return full;
  const pts = [
    ...plan.rooms.flatMap((r) => r.polygon),
    ...plan.items.flatMap((i) => itemCorners(i)),
  ];
  const wall = Math.max(plan.wallThickness, ...plan.rooms.flatMap((r) => (r.walls ?? []).map((w) => w ?? 0)));
  const pad = MARGIN_IN + wall;
  const minX = Math.min(...pts.map((p) => p.x)) - pad, maxX = Math.max(...pts.map((p) => p.x)) + pad;
  const minY = Math.min(...pts.map((p) => p.y)) - pad, maxY = Math.max(...pts.map((p) => p.y)) + pad;
  return { x: minX * scale, y: minY * scale, w: (maxX - minX) * scale, h: (maxY - minY) * scale };
}
