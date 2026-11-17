import type { Point } from "../../shared/schemas";
import { bbox, distPointSegment, pointInPolygon, rectLocal } from "./geometry";

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

const overlapArea = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));

/**
 * Where a room's label should go (its center, in the same units as `poly`): somewhere the
 * whole label fits inside the room and covers as little furniture as possible, preferring
 * spots near the middle and away from the walls.
 *
 * @param obstacles  footprints of furniture and fixtures (any units-matching polygons)
 * @param w,h        label size
 * @returns the point, and whether the label fits inside the room at all
 */
export function placeLabel(poly: Point[], obstacles: Point[][], w: number, h: number): { at: Point; fits: boolean } {
  const b = bbox(poly);
  const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  const edges = poly.map((a, i) => [a, poly[(i + 1) % poly.length]] as const);
  const wallDist = (p: Point) => Math.min(...edges.map(([a, c]) => distPointSegment(p, a, c)));
  const boxes = obstacles.map((o) => bbox(o)).filter((o) => overlapArea(o, b) > 0);
  const diag = Math.hypot(b.width, b.height) || 1;

  let best: { at: Point; cost: number } | null = null;
  const steps = 20;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = { x: b.minX + (b.width * i) / steps, y: b.minY + (b.height * j) / steps };
      const rect = { minX: p.x - w / 2, maxX: p.x + w / 2, minY: p.y - h / 2, maxY: p.y + h / 2 };
      if (!rectLocal(rect.minX, rect.minY, rect.maxX, rect.maxY).every((c) => pointInPolygon(c, poly, 0))) continue;
      const covered = boxes.reduce((s, o) => s + overlapArea(rect, o), 0) / (w * h); // 0–1+ of the label covered
      // Covering furniture matters most; then stay central and off the walls.
      const cost = covered * 10 + (Math.hypot(p.x - center.x, p.y - center.y) / diag) * 0.6 - Math.min(wallDist(p), diag / 4) / diag;
      if (!best || cost < best.cost - 1e-9) best = { at: p, cost };
    }
  }
  if (best) return { at: best.at, fits: true };

  // Label is bigger than the room at this zoom: the most open point inside it.
  let at = center, d = pointInPolygon(center, poly, 0) ? wallDist(center) : -1;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const p = { x: b.minX + (b.width * i) / steps, y: b.minY + (b.height * j) / steps };
      if (pointInPolygon(p, poly, 0) && wallDist(p) > d) { at = p; d = wallDist(p); }
    }
  }
  return { at, fits: false };
}
