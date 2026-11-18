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

/** Walls along the same line closer than this (inches) are meant to be one straight wall. */
const ALIGN_TOL_IN = 12;
/** ...as long as they follow on from each other along the line (inches between their ends). */
const ALIGN_GAP_IN = 24;

/**
 * Line up room edges that are meant to be one straight wall: edges facing the same way, a few
 * inches apart, one after another along the line (e.g. a bedroom, its closet and the utility room
 * all against the same outside wall). Each run moves to the line of its longest stretch. Small
 * jogs inside one room are removed the same way.
 */
export function alignWalls<R extends Pick<Room, "polygon" | "walls">>(rooms: R[]): R[] {
  const edges = roomEdges(rooms);
  const len = (e: RoomEdge) => e.span[1] - e.span[0];
  const groupOf = new Map<RoomEdge, RoomEdge[]>();
  for (const e of edges) groupOf.set(e, [e]);
  // Union edges that line up; repeat until nothing changes (runs can chain).
  let merged = true;
  while (merged) {
    merged = false;
    for (const a of edges) {
      for (const b of edges) {
        const ga = groupOf.get(a)!, gb = groupOf.get(b)!;
        if (ga === gb || a.axis !== b.axis || a.inward !== b.inward) continue;
        if (Math.abs(a.coord - b.coord) > ALIGN_TOL_IN) continue;
        const gap = Math.max(a.span[0], b.span[0]) - Math.min(a.span[1], b.span[1]);
        if (gap > ALIGN_GAP_IN) continue;
        // Don't line up the two sides of a real step in one room's own outline if it's big.
        const all = [...ga, ...gb];
        const coords = all.map((e) => e.coord);
        if (Math.max(...coords) - Math.min(...coords) > ALIGN_TOL_IN) continue;
        for (const e of all) groupOf.set(e, all);
        merged = true;
      }
    }
  }
  // Each run takes the line of its longest stretch (by total length at that line).
  const target = new Map<RoomEdge, number>();
  for (const g of new Set(groupOf.values())) {
    if (g.length < 2) continue;
    const best = [...g].sort((x, y) => len(y) - len(x))[0];
    for (const e of g) target.set(e, best.coord);
  }
  return rooms.map((r, ri) => {
    const poly = r.polygon.map((p) => ({ ...p }));
    for (const e of edges) {
      if (e.room !== ri || !target.has(e)) continue;
      const t = target.get(e)!;
      const p = poly[e.edge], q = poly[(e.edge + 1) % poly.length];
      if (e.axis === "h") { p.y = t; q.y = t; } else { p.x = t; q.x = t; }
    }
    return { ...r, ...simplifyOutline(poly, r.walls) };
  });
}

/** Drop repeated corners and corners in the middle of a straight wall (keeping walls in step). */
export function simplifyOutline(polygon: Point[], walls?: (number | null)[]): { polygon: Point[]; walls?: (number | null)[] } {
  let pts = polygon.map((p, i) => ({ p, w: walls ? walls[i] : undefined }));
  const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[(i - 1 + pts.length) % pts.length], cur = pts[i], next = pts[(i + 1) % pts.length];
      // A zero-length edge (cur → next): drop cur, its edge's wall goes with it.
      if (same(cur.p, next.p)) { pts.splice(i, 1); changed = true; break; }
      // cur sits on the straight line prev → next with the same wall either side: drop it. (Where
      // the wall changes, e.g. an outside wall meeting a thin divider, the corner stays.)
      const cross = (cur.p.x - prev.p.x) * (next.p.y - prev.p.y) - (cur.p.y - prev.p.y) * (next.p.x - prev.p.x);
      if (Math.abs(cross) < 0.01 && prev.w === cur.w) { pts.splice(i, 1); changed = true; break; }
    }
  }
  return { polygon: pts.map((x) => x.p), walls: walls ? pts.map((x) => x.w as number | null) : undefined };
}

/** Standard wall thicknesses (inches) a plan is drawn with, whatever the uploaded image looked like. */
export interface WallStandard { interior: number; exterior: number }

const roundHalf = (n: number) => Math.round(n * 2) / 2;
const clampTo = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

interface Facing { f: RoomEdge; gap: number; len: number }

function facingEdges(e: RoomEdge, all: RoomEdge[]): Facing[] {
  const out: Facing[] = [];
  for (const f of all) {
    if (f.room === e.room || f.axis !== e.axis || f.inward !== -e.inward) continue;
    const gap = (f.coord - e.coord) * -e.inward;
    const len = overlap(e.span, f.span);
    if (gap > -0.5 && gap <= MAX_WALL_IN && len >= 6) out.push({ f, gap: Math.max(0, gap), len });
  }
  return out;
}

const weightedMedian = (xs: Array<{ v: number; w: number }>) => {
  const s = [...xs].sort((a, b) => a.v - b.v);
  const total = s.reduce((t, x) => t + x.w, 0);
  let acc = 0;
  for (const x of s) if ((acc += x.w) >= total / 2) return x.v;
  return s[s.length - 1]?.v ?? 0;
};

/** The plan's standard inside and outside walls, from what it has now (or sensible defaults). */
export function wallStandard(rooms: Pick<Room, "polygon" | "walls">[]): WallStandard {
  const edges = roomEdges(rooms);
  const inside: Array<{ v: number; w: number }> = [], outside: Array<{ v: number; w: number }> = [];
  for (const e of edges) {
    const t = rooms[e.room].walls?.[e.edge];
    if (t == null) continue;
    const facing = facingEdges(e, edges);
    const len = e.span[1] - e.span[0];
    if (facing.length) {
      for (const x of facing) if (x.gap >= 2.5) inside.push({ v: x.gap, w: x.len });
    } else if (t >= 3) {
      outside.push({ v: t, w: len });
    }
  }
  const interior = inside.length ? clampTo(roundHalf(weightedMedian(inside)), 3.5, 6) : 4.5;
  const exterior = outside.length ? clampTo(roundHalf(weightedMedian(outside)), Math.max(interior, 5), 10) : Math.max(6, interior + 1.5);
  return { interior, exterior };
}

/**
 * Make every wall one of two standard thicknesses, so plans look consistent however the upload
 * was drawn: walls between rooms are exactly the inside thickness (rooms on either side move
 * apart or together to make it so, about the middle of the wall), outside walls are the outside
 * thickness, and edges open to another room stay open. A wall on either side of a shared edge
 * means there's a wall. `pinned` edges ("room:edge") don't move; their neighbours move instead.
 */
export function standardizeWalls<R extends Pick<Room, "polygon" | "walls">>(
  rooms: R[],
  standard: WallStandard = wallStandard(rooms),
  pinned: Set<string> = new Set(),
): { rooms: R[]; standard: WallStandard } {
  const { interior, exterior } = standard;
  const edges = roomEdges(rooms);
  const key = (e: RoomEdge) => `${e.room}:${e.edge}`;
  const wallOf = (e: RoomEdge) => rooms[e.room].walls?.[e.edge];
  const target = new Map<string, number>(); // new face coord
  const thick = new Map<string, number | null>();

  for (const e of edges) {
    const facing = facingEdges(e, edges);
    const mine = wallOf(e);
    if (!facing.length) {
      // Nothing on the other side: an outside wall (even if it had been marked open).
      thick.set(key(e), exterior);
      continue;
    }
    const walled = mine !== null || facing.some((x) => wallOf(x.f) !== null);
    if (!walled) { thick.set(key(e), null); continue; }
    thick.set(key(e), interior);
    if (pinned.has(key(e))) continue;
    // Where this face goes: half the wall from the wall's middle, or a whole wall from a pinned neighbour.
    const pin = facing.find((x) => pinned.has(key(x.f)));
    if (pin) {
      target.set(key(e), pin.f.coord + e.inward * interior);
    } else {
      const middle = weightedMedian(facing.map((x) => ({ v: (e.coord + x.f.coord) / 2, w: x.len })));
      target.set(key(e), middle + e.inward * (interior / 2));
    }
  }

  const out = rooms.map((r, ri) => {
    const n = r.polygon.length;
    const poly = r.polygon.map((p) => ({ ...p }));
    const walls = r.polygon.map((_, i) => {
      const e = edges.find((x) => x.room === ri && x.edge === i);
      if (!e) return r.walls?.[i] ?? interior; // angled edge: leave as it was
      const t = thick.get(key(e));
      return t === undefined ? (r.walls?.[i] ?? interior) : t;
    });
    for (const e of edges) {
      if (e.room !== ri || !target.has(key(e))) continue;
      const c = target.get(key(e))!;
      const p = poly[e.edge], q = poly[(e.edge + 1) % n];
      if (e.axis === "h") { p.y = c; q.y = c; } else { p.x = c; q.x = c; }
    }
    return { ...r, ...simplifyOutline(poly, walls) };
  });
  return { rooms: out, standard };
}
