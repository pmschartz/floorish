import type { Item, Point, Room } from "../../shared/schemas";
import { clearancesFor, PASSIVE_CATEGORIES } from "../catalog/furniture";
import { clearanceZone, doorSwing, itemCorners, itemParts, partsOverlap, pointInPolygon, polygonInside } from "../model/geometry";

export type IssueKind = "overlap" | "outside-room" | "clearance" | "door-swing";

export interface Issue {
  id: string;
  kind: IssueKind;
  severity: "error" | "warning";
  message: string;
  itemIds: string[];
}

/** Pairs that are meant to sit together (a chair tucked under a desk). */
const NESTS: Array<[string, string]> = [
  ["office chair", "desk"],
  ["dining chair", "dining table"],
  ["ottoman", "sofa"],
  ["ottoman", "sectional"],
];
const nests = (a: string, b: string) => NESTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const isSolid = (i: Item) => !PASSIVE_CATEGORIES.has(i.category) && i.shape !== "door" && i.shape !== "window" && i.shape !== "opening";
const name = (i: Item) => i.label || i.category || "Item";

type Segment = [Point, Point];

/**
 * The walls on the plan as line segments: every room edge that has a wall. Edges marked open
 * (a kitchen open to the dining room) aren't walls, so there's room to pull a chair out across them.
 */
export function wallSegments(rooms: Room[]): Segment[] {
  const out: Segment[] = [];
  for (const r of rooms) {
    const n = r.polygon.length;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      if (r.walls && r.walls[i] === null) continue;
      out.push([r.polygon[i], r.polygon[(i + 1) % n]]);
    }
  }
  return out;
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
/** Do two segments cross (properly: touching end to end or running along each other doesn't count)? */
function segmentsCross(a: Segment, b: Segment): boolean {
  const d1 = cross(b[0], b[1], a[0]), d2 = cross(b[0], b[1], a[1]);
  const d3 = cross(a[0], a[1], b[0]), d4 = cross(a[0], a[1], b[1]);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
}

/** A rectangle pulled in by `m` on every side, so a wall it only touches doesn't count. */
function shrinkRect(pts: Point[], m: number): Point[] {
  if (pts.length !== 4) return pts;
  const len = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
  if (len(pts[0], pts[1]) <= 2 * m || len(pts[1], pts[2]) <= 2 * m) return pts;
  return pts.map((p, i) => {
    const next = pts[(i + 1) % 4], prev = pts[(i + 3) % 4];
    const a = len(p, next), b = len(p, prev);
    return { x: p.x + (m * (next.x - p.x)) / a + (m * (prev.x - p.x)) / b, y: p.y + (m * (next.y - p.y)) / a + (m * (prev.y - p.y)) / b };
  });
}

/** Does this area run into a wall? (Crosses one, or has a wall passing through it.) */
export function hitsWall(zone: Point[], walls: Segment[]): boolean {
  const z = shrinkRect(zone, 0.05);
  const edges: Segment[] = z.map((p, i) => [p, z[(i + 1) % z.length]]);
  return walls.some((w) => pointInPolygon(w[0], z, 0) || pointInPolygon(w[1], z, 0) || edges.some((e) => segmentsCross(e, w)));
}

export function roomFor(item: Pick<Item, "x" | "y">, rooms: Room[]): Room | undefined {
  return rooms.find((r) => r.polygon.length >= 3 && pointInPolygon({ x: item.x, y: item.y }, r.polygon));
}

export function runLayoutChecks(items: Item[], rooms: Room[], fmt: (inches: number) => string = (n) => `${Math.round(n)}"`): Issue[] {
  const issues: Issue[] = [];
  const solids = items.filter(isSolid);
  const corners = new Map(items.map((i) => [i.id, itemCorners(i)]));
  const parts = new Map(items.map((i) => [i.id, itemParts(i)]));

  // 1. Overlaps
  for (let a = 0; a < solids.length; a++) {
    for (let b = a + 1; b < solids.length; b++) {
      const A = solids[a], B = solids[b];
      if (nests(A.category, B.category)) continue;
      // Fixtures stack on purpose (a sink in a counter, a dishwasher under it).
      if (A.shape === "fixture" && B.shape === "fixture") continue;
      if (partsOverlap(parts.get(A.id)!, parts.get(B.id)!)) {
        issues.push({
          id: `overlap:${A.id}:${B.id}`,
          kind: "overlap",
          severity: "error",
          message: `${name(A)} overlaps ${name(B)}`,
          itemIds: [A.id, B.id],
        });
      }
    }
  }

  // 2. Outside every room (only once rooms have been traced)
  const traced = rooms.filter((r) => r.polygon.length >= 3);
  if (traced.length) {
    // Fixtures come from the drawing and hug the walls; only check furniture.
    for (const it of solids.filter((i) => i.shape !== "fixture")) {
      const c = corners.get(it.id)!;
      if (!traced.some((r) => polygonInside(c, r.polygon))) {
        issues.push({
          id: `outside:${it.id}`,
          kind: "outside-room",
          severity: "warning",
          message: `${name(it)} runs through a wall or sits outside the traced rooms`,
          itemIds: [it.id],
        });
      }
    }
  }

  // 3. Clearances: room to walk past or pull out a chair, up to a wall or another piece (not an open side).
  const walls = wallSegments(traced);
  for (const it of solids) {
    const room = roomFor(it, traced);
    for (const rule of clearancesFor(it)) {
      const allow = new Set([...(rule.allow ?? []), ...PASSIVE_CATEGORIES]);
      const blockersAt = (dist: number) =>
        solids.filter(
          (o) => o.id !== it.id && !allow.has(o.category) && !nests(o.category, it.category) &&
            partsOverlap([clearanceZone(it, rule.side, dist)], parts.get(o.id)!),
        );
      // A wall in the way, or the space runs out of the rooms altogether (into a wall, or outdoors).
      // Across an open side the space is just the next room, so that's fine.
      const wallAt = (dist: number) => {
        if (!room) return false;
        const zone = clearanceZone(it, rule.side, dist);
        return zone.some((p) => !traced.some((r) => pointInPolygon(p, r.polygon))) || hitsWall(zone, walls);
      };
      const blocked = (dist: number) => wallAt(dist) || blockersAt(dist).length > 0;

      if (!blocked(rule.dist)) continue;

      // Binary-search how much clear space there actually is.
      let lo = 0, hi = rule.dist;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (blocked(mid)) hi = mid; else lo = mid;
      }
      const blockers = blockersAt(rule.dist);
      const by = wallAt(rule.dist) && blockers.length === 0 ? "a wall" : blockers.map(name).join(", ");
      const sideWord = rule.side === "front" ? "in front" : rule.side === "back" ? "behind it" : `on its ${rule.side}`;
      issues.push({
        id: `clearance:${it.id}:${rule.side}`,
        kind: "clearance",
        severity: "warning",
        message: `${name(it)} needs ${fmt(rule.dist)} clear ${sideWord} (${rule.why}); only about ${fmt(lo)} before ${by}`,
        itemIds: [it.id, ...blockers.map((b) => b.id)],
      });
    }
  }

  // 4. Door swings
  for (const door of items.filter((i) => i.shape === "door")) {
    const swing = doorSwing(door);
    // Fixtures come from the drawing, which is drawn so its doors clear them; check furniture.
    for (const it of solids.filter((i) => i.shape !== "fixture")) {
      if (partsOverlap([swing], parts.get(it.id)!)) {
        issues.push({
          id: `door:${door.id}:${it.id}`,
          kind: "door-swing",
          severity: "error",
          message: `${name(it)} blocks the swing of ${name(door)}`,
          itemIds: [it.id, door.id],
        });
      }
    }
  }

  return issues;
}
