import type { Item, Point } from "../../shared/schemas";

export const EPS = 0.25; // inches; shapes that only touch don't count as overlapping

export function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function bbox(pts: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function centroid(pts: Point[]): Point {
  const b = bbox(pts);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** Ray casting; points on the edge count as inside (within tol). */
export function pointInPolygon(p: Point, poly: Point[], tol = EPS): boolean {
  if (poly.length < 3) return false;
  for (let i = 0; i < poly.length; i++) {
    if (distPointSegment(p, poly[i], poly[(i + 1) % poly.length]) <= tol) return true;
  }
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function distPointSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function rotate(p: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Local frame: +x is the item's right, +y is its front (the bottom edge at rotation 0). */
export function toWorld(item: Pick<Item, "x" | "y" | "rotation">, local: Point): Point {
  const r = rotate(local, item.rotation);
  return { x: item.x + r.x, y: item.y + r.y };
}

export function rectLocal(minX: number, minY: number, maxX: number, maxY: number): Point[] {
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

/** Footprint corners (circles and L-shapes use their bounding rectangle). */
export function itemCorners(item: Pick<Item, "x" | "y" | "rotation" | "width" | "depth">): Point[] {
  const hw = item.width / 2, hd = item.depth / 2;
  return rectLocal(-hw, -hd, hw, hd).map((p) => toWorld(item, p));
}

/**
 * Seat depth of the arms of L- and U-shaped sectionals (inches), capped so the
 * shape still reads as an L/U when someone shrinks it.
 */
export function armDepth(shape: Item["shape"], w: number, d: number): number {
  return shape === "U" ? Math.min(38, w * 0.3, d * 0.5) : Math.min(38, Math.min(w, d) * 0.5);
}

/**
 * Outline of a shape in local inches, centered on 0,0.
 * L: long run across the back, return down the left side.
 * U: run across the back with returns down both sides, open toward the front.
 */
export function outlineLocal(shape: Item["shape"], w: number, d: number): Point[] {
  const hw = w / 2, hd = d / 2, t = armDepth(shape, w, d);
  if (shape === "L") {
    return [
      { x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: -hd + t },
      { x: -hw + t, y: -hd + t }, { x: -hw + t, y: hd }, { x: -hw, y: hd },
    ];
  }
  if (shape === "U") {
    return [
      { x: -hw, y: -hd }, { x: hw, y: -hd }, { x: hw, y: hd }, { x: hw - t, y: hd },
      { x: hw - t, y: -hd + t }, { x: -hw + t, y: -hd + t }, { x: -hw + t, y: hd }, { x: -hw, y: hd },
    ];
  }
  return rectLocal(-hw, -hd, hw, hd);
}

/**
 * The item's footprint as convex pieces in plan inches, so overlap tests respect
 * the open middle of L- and U-shapes (a coffee table can sit inside a U).
 */
export function itemParts(item: Pick<Item, "x" | "y" | "rotation" | "width" | "depth" | "shape">): Point[][] {
  const hw = item.width / 2, hd = item.depth / 2;
  const t = armDepth(item.shape, item.width, item.depth);
  let parts: Point[][];
  if (item.shape === "L") {
    parts = [rectLocal(-hw, -hd, hw, -hd + t), rectLocal(-hw, -hd + t, -hw + t, hd)];
  } else if (item.shape === "U") {
    parts = [
      rectLocal(-hw, -hd, hw, -hd + t),
      rectLocal(-hw, -hd + t, -hw + t, hd),
      rectLocal(hw - t, -hd + t, hw, hd),
    ];
  } else {
    parts = [rectLocal(-hw, -hd, hw, hd)];
  }
  return parts.map((p) => p.map((pt) => toWorld(item, pt)));
}

/** True if any convex piece of `a` overlaps any convex piece of `b`. */
export function partsOverlap(a: Point[][], b: Point[][], eps = EPS): boolean {
  return a.some((pa) => b.some((pb) => convexOverlap(pa, pb, eps)));
}

export type Side = "front" | "back" | "left" | "right";

/** The rectangle of floor that must stay clear on one side of an item. */
export function clearanceZone(item: Pick<Item, "x" | "y" | "rotation" | "width" | "depth">, side: Side, dist: number): Point[] {
  const hw = item.width / 2, hd = item.depth / 2;
  const local =
    side === "front" ? rectLocal(-hw, hd, hw, hd + dist)
    : side === "back" ? rectLocal(-hw, -hd - dist, hw, -hd)
    : side === "left" ? rectLocal(-hw - dist, -hd, -hw, hd)
    : rectLocal(hw, -hd, hw + dist, hd);
  return local.map((p) => toWorld(item, p));
}

/** Door swing: quarter circle hinged at the door's left end, opening toward its front. */
export function doorSwing(item: Pick<Item, "x" | "y" | "rotation" | "width" | "depth">, segments = 8): Point[] {
  const hinge = { x: -item.width / 2, y: item.depth / 2 };
  const pts: Point[] = [hinge];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * (Math.PI / 2);
    pts.push({ x: hinge.x + item.width * Math.cos(a), y: hinge.y + item.width * Math.sin(a) });
  }
  return pts.map((p) => toWorld(item, p));
}

function axes(poly: Point[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ex = b.x - a.x, ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    if (len > 1e-9) out.push({ x: -ey / len, y: ex / len });
  }
  return out;
}

function project(poly: Point[], axis: Point) {
  let min = Infinity, max = -Infinity;
  for (const p of poly) {
    const v = p.x * axis.x + p.y * axis.y;
    min = Math.min(min, v); max = Math.max(max, v);
  }
  return { min, max };
}

/** Separating axis test for two convex polygons; true if they overlap by more than eps. */
export function convexOverlap(a: Point[], b: Point[], eps = EPS): boolean {
  for (const axis of [...axes(a), ...axes(b)]) {
    const pa = project(a, axis), pb = project(b, axis);
    if (pa.max - eps <= pb.min || pb.max - eps <= pa.min) return false;
  }
  return true;
}

/** True if every vertex of `inner` lies inside `outer` (good enough for rectangles in rooms). */
export function polygonInside(inner: Point[], outer: Point[]): boolean {
  return inner.every((p) => pointInPolygon(p, outer));
}

export function snap(n: number, step: number): number {
  return Math.round(n / step) * step;
}
