import type { Item, Point, Room } from "../../shared/schemas";

/**
 * Wall thickness per room edge, measured so walls meet up:
 * - Between two rooms, the wall is the gap between their facing edges (rooms trace the inside
 *   faces of their walls), however the plan happens to draw it.
 * - Elsewhere, the thickness measured from the image when the room was snapped to its walls.
 */

/** Thicker than this isn't a wall (it's a gap between rooms, or a dimension line). */
export const MAX_WALL_IN = 14;
const MIN_WALL_IN = 2;

export interface RoomEdge {
  room: number;
  edge: number;
  axis: "h" | "v";
  coord: number; // y (h) or x (v) of the room's inside face, inches
  inward: 1 | -1; // which way the room's interior lies along the other axis
  span: [number, number];
}

function signedArea(pts: Point[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** The axis-aligned edges of each room (angled edges are skipped). */
export function roomEdges(rooms: Pick<Room, "polygon">[]): RoomEdge[] {
  const out: RoomEdge[] = [];
  rooms.forEach((r, ri) => {
    const poly = r.polygon;
    const cw = signedArea(poly) >= 0 ? 1 : -1;
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length];
      const dx = q.x - p.x, dy = q.y - p.y;
      if (Math.abs(dy) < 0.5 && Math.abs(dx) >= 1) {
        out.push({ room: ri, edge: i, axis: "h", coord: (p.y + q.y) / 2, inward: (cw * Math.sign(dx)) as 1 | -1, span: [Math.min(p.x, q.x), Math.max(p.x, q.x)] });
      } else if (Math.abs(dx) < 0.5 && Math.abs(dy) >= 1) {
        out.push({ room: ri, edge: i, axis: "v", coord: (p.x + q.x) / 2, inward: (-cw * Math.sign(dy)) as 1 | -1, span: [Math.min(p.y, q.y), Math.max(p.y, q.y)] });
      }
    });
  });
  return out;
}

const overlap = (a: [number, number], b: [number, number]) => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

/**
 * The gap to rooms on the other side of this edge, weighted by how much they share: 0 when a
 * room touches it directly (a thin divider), null when nothing is there (an outside wall).
 */
function gapToNeighbours(e: RoomEdge, all: RoomEdge[]): number | null {
  const found: Array<{ gap: number; len: number }> = [];
  for (const f of all) {
    if (f.room === e.room || f.axis !== e.axis || f.inward !== -e.inward) continue;
    const gap = (f.coord - e.coord) * -e.inward; // outward from e
    const len = overlap(e.span, f.span);
    if (gap > -0.5 && gap <= MAX_WALL_IN && len >= 6) found.push({ gap: Math.max(0, gap), len });
  }
  if (!found.length) return null;
  // Weighted median, so one odd neighbour doesn't set the whole wall.
  found.sort((a, b) => a.gap - b.gap);
  const total = found.reduce((s, f) => s + f.len, 0);
  let acc = 0;
  for (const f of found) if ((acc += f.len) >= total / 2) return f.gap;
  return found[found.length - 1].gap;
}

/** Outside walls measured thinner than this were probably read as a single line. */
const THIN_OUTSIDE_IN = 3;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/**
 * Per-edge wall thickness (inches) for each room, so walls meet up:
 * - facing another room across a gap: the wall fills the gap;
 * - touching another room: a thin divider (as measured);
 * - an outside wall: as measured, unless it came out as a hairline (an outline or double-line
 *   wall read as one line), in which case it takes the plan's typical outside wall.
 * Null stays null where it opens onto another room; with nothing on the other side it becomes an
 * outside wall.
 */
export function connectWalls(rooms: Pick<Room, "polygon" | "walls">[], fallback = 5): { walls: (number | null)[][]; typical: number } {
  const edges = roomEdges(rooms);
  const byKey = new Map(edges.map((e) => [`${e.room}:${e.edge}`, e]));
  const clamp = (t: number) => Math.round(Math.min(MAX_WALL_IN, Math.max(MIN_WALL_IN, t)) * 2) / 2;
  type Cell = { t: number | null | undefined; outside: boolean };
  const cells: Cell[][] = rooms.map((r, ri) =>
    r.polygon.map((_, i) => {
      const old = r.walls ? r.walls[i] : undefined;
      const e = byKey.get(`${ri}:${i}`);
      const gap = e ? gapToNeighbours(e, edges) : null;
      // Open to the next room stays open. "Open" with no room on the other side is really an
      // outside wall the image didn't show clearly (e.g. a concrete wall drawn as two thin lines).
      if (old === null) return gap != null || !e ? { t: null, outside: false } : { t: undefined, outside: true };
      if (gap != null && gap > 0) return { t: clamp(gap), outside: false };
      if (gap === 0) return { t: old == null ? undefined : clamp(old), outside: false };
      return { t: old == null ? undefined : clamp(old), outside: !!e };
    }),
  );
  const all = cells.flat().map((c) => c.t).filter((t): t is number => typeof t === "number");
  const typical = median(all) ?? fallback;
  const outsideTypical = median(cells.flat().filter((c) => c.outside && typeof c.t === "number" && c.t >= THIN_OUTSIDE_IN).map((c) => c.t as number));
  return {
    walls: cells.map((row) => row.map((c) => {
      if (c.t === null) return null;
      if (c.t === undefined) return c.outside && outsideTypical ? outsideTypical : typical;
      if (c.outside && outsideTypical && c.t < THIN_OUTSIDE_IN) return outsideTypical;
      return c.t;
    })),
    typical,
  };
}

/**
 * Put each door, window and opening in the middle of the wall it sits in, as deep as that wall,
 * so it still cuts a clean gap once walls are thicker.
 */
export function fitOpeningsToWalls<T extends Pick<Item, "shape" | "x" | "y" | "width" | "depth" | "rotation">>(
  items: T[],
  rooms: Pick<Room, "polygon">[],
  walls: (number | null)[][],
): T[] {
  const edges = roomEdges(rooms);
  return items.map((it) => {
    if (it.shape !== "door" && it.shape !== "window" && it.shape !== "opening") return it;
    const rot = ((Math.round(it.rotation / 90) * 90) % 180 + 180) % 180;
    const axis = rot === 0 ? "h" : "v"; // a door at 0° sits in a horizontal wall
    const along = axis === "h" ? it.x : it.y, perp = axis === "h" ? it.y : it.x;
    let best: { e: RoomEdge; t: number; d: number } | null = null;
    for (const e of edges) {
      const t = walls[e.room]?.[e.edge];
      if (e.axis !== axis || t == null || along < e.span[0] - 2 || along > e.span[1] + 2) continue;
      // Distance from the opening's centre to this wall's band [face, face + t] outward.
      const mid = e.coord - e.inward * (t / 2);
      const d = Math.abs(perp - mid);
      if (d <= t / 2 + 8 && (!best || d < best.d)) best = { e, t, d };
    }
    if (!best) return it;
    const mid = best.e.coord - best.e.inward * (best.t / 2);
    return axis === "h" ? { ...it, y: mid, depth: best.t } : { ...it, x: mid, depth: best.t };
  });
}
