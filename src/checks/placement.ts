import type { Item, Point, Room } from "../../shared/schemas";
import { PASSIVE_CATEGORIES } from "../catalog/furniture";
import { bbox, convexOverlap, distPointSegment, doorSwing, itemCorners, polygonInside } from "../model/geometry";

export interface Spot {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Find an open spot in a room for a w×d piece: fully inside the room, not overlapping
 * anything solid or a door swing. Prefers spots against a wall (what most furniture wants).
 */
export function findOpenSpot(room: Room, items: Item[], w: number, d: number, step = 6): Spot | null {
  if (room.polygon.length < 3) return null;
  const b = bbox(room.polygon);
  const blockers: Point[][] = [];
  for (const it of items) {
    if (it.shape === "door") blockers.push(doorSwing(it));
    else if (!PASSIVE_CATEGORIES.has(it.category)) blockers.push(itemCorners(it));
  }
  const edges = room.polygon.map((p, i) => [p, room.polygon[(i + 1) % room.polygon.length]] as const);
  const wallDist = (pts: Point[]) => Math.min(...pts.flatMap((p) => edges.map(([a, c]) => distPointSegment(p, a, c))));

  let best: { spot: Spot; score: number } | null = null;
  for (const rotation of [0, 90]) {
    const [fw, fd] = rotation === 0 ? [w, d] : [d, w];
    for (let y = b.minY + fd / 2 + 1; y <= b.maxY - fd / 2 - 1; y += step) {
      for (let x = b.minX + fw / 2 + 1; x <= b.maxX - fw / 2 - 1; x += step) {
        const cand = { x, y, rotation, width: w, depth: d };
        const c = itemCorners(cand);
        if (!polygonInside(c, room.polygon)) continue;
        if (blockers.some((bl) => convexOverlap(c, bl))) continue;
        const score = wallDist(c);
        if (!best || score < best.score) best = { spot: { x: Math.round(x), y: Math.round(y), rotation }, score };
      }
    }
  }
  return best?.spot ?? null;
}
