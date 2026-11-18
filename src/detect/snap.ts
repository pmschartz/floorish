import type { Point } from "../../shared/schemas";

/** 1 where a pixel is dark enough to be wall ink, else 0. Row-major. */
export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

export function maskFromRgba(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, threshold = 110): Mask {
  const data = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const a = rgba[p + 3] / 255;
    // Transparent pixels count as white paper.
    const lum = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) * a + 255 * (1 - a);
    data[i] = lum < threshold ? 1 : 0;
  }
  return { w, h, data };
}

const dark = (m: Mask, x: number, y: number) =>
  x >= 0 && y >= 0 && x < m.w && y < m.h ? m.data[(y | 0) * m.w + (x | 0)] : 0;

export type Axis = "h" | "v";

export interface Band {
  lo: number; // first wall row (h) / column (v)
  hi: number; // last wall row / column, inclusive
  /** Drawn as an outline with a lighter fill between its two faces (not solid ink). */
  hollow?: boolean;
}

export interface SnapOpts {
  radius: number; // how far from the guess to look for a wall, px
  minThick: number; // thinner dark runs are lines/text, not walls
  maxThick: number;
  /** Anything that isn't blank paper (fills, hatching, tints). Lets outlined walls count as one wall. */
  fill?: Mask;
  /** Widest fill between a wall's two outline lines, px. */
  maxFill: number;
}

export function defaultOpts(m: Mask, fill?: Mask): SnapOpts {
  const big = Math.max(m.w, m.h);
  return {
    radius: Math.max(6, Math.round(big * 0.02)),
    minThick: Math.max(2, Math.round(big * 0.0015)),
    maxThick: Math.round(big * 0.05),
    fill,
    maxFill: Math.max(4, Math.round(big * 0.015)),
  };
}

/**
 * Look for a wall running along `axis` near `at`, covering the span [from, to].
 * For a horizontal wall (h), `at` is a y and the span is in x. Returns the band of
 * rows (or columns) that are mostly dark across the middle of the span.
 */
export function findWallBand(m: Mask, axis: Axis, at: number, from: number, to: number, o: SnapOpts, minScore = 0.35): Band | null {
  const a = Math.min(from, to), b = Math.max(from, to);
  const len = b - a;
  if (len < 2) return null;
  const s0 = a + len * 0.1, s1 = b - len * 0.1;
  const step = Math.max(1, (s1 - s0) / 200);
  const lo = Math.max(0, Math.floor(at - o.radius));
  const hi = Math.min((axis === "h" ? m.h : m.w) - 1, Math.ceil(at + o.radius));

  const limit = axis === "h" ? m.h : m.w;
  const isWall = (r: number) => {
    if (r < 0 || r >= limit) return false;
    let hits = 0, n = 0;
    for (let s = s0; s <= s1; s += step, n++) hits += axis === "h" ? dark(m, s, r) : dark(m, r, s);
    return n > 0 && hits / n >= minScore;
  };
  // Filled (not blank paper) across much of the span: the inside of an outlined wall.
  const isFilled = (r: number) => {
    if (!o.fill || r < 0 || r >= limit) return false;
    let hits = 0, n = 0;
    for (let s = s0; s <= s1; s += step, n++) hits += axis === "h" ? dark(o.fill, s, r) : dark(o.fill, r, s);
    // Windows and doors interrupt the fill, so "mostly" is a bit under half the wall.
    return n > 0 && hits / n >= 0.45;
  };

  // Dark runs (lines), wider than the search window where a run touches its edge.
  const runs: Band[] = [];
  const pad = o.maxFill + o.maxThick; // look past the window for a wall's other outline
  for (let r = lo - pad, start = -1; r <= hi + pad + 1; r++) {
    const w = r <= hi + pad && isWall(r);
    if (w && start < 0) start = r;
    if (!w && start >= 0) { runs.push({ lo: start, hi: r - 1 }); start = -1; }
  }
  // Two outline lines with a fill between them are one wall (e.g. a gray or yellow wall drawn
  // with dark edges). Blank paper between lines doesn't count, so tinted plans aren't affected.
  const merged: Band[] = [];
  for (const run of runs) {
    const prev = merged[merged.length - 1];
    const gap = prev ? run.lo - prev.hi - 1 : Infinity;
    let filled = gap <= o.maxFill && run.hi - prev!.lo + 1 <= o.maxThick;
    for (let r = prev ? prev.hi + 1 : 0; filled && r < run.lo; r++) filled = isFilled(r);
    if (prev && filled) { prev.hi = run.hi; prev.hollow = true; } else merged.push({ ...run });
  }

  let best: Band | null = null, bestDist = Infinity;
  for (const band of merged) {
    if (band.hi < lo || band.lo > hi) continue; // outside the search window
    const thick = band.hi - band.lo + 1;
    if (thick >= o.minThick && thick <= o.maxThick) {
      const dist = at < band.lo ? band.lo - at : at > band.hi + 1 ? at - band.hi - 1 : 0;
      if (dist < bestDist) { best = band; bestDist = dist; }
    }
  }
  return best;
}

export interface SnappedEdge {
  axis: Axis | null; // null: angled edge, left as drawn
  coord: number; // y for h edges, x for v edges (the room's interior face)
  inward: 1 | -1; // direction of the room's interior along the perpendicular axis
  wall: number | null; // thickness in px, or null where there's no wall (open plan)
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

/** Snap each axis-aligned edge of a room to the inside face of the nearest wall. */
export function snapRoomEdges(poly: Point[], m: Mask, o: SnapOpts): SnappedEdge[] {
  const cw = signedArea(poly) >= 0 ? 1 : -1; // clockwise on screen (y down)
  const tan3 = Math.tan((3 * Math.PI) / 180);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  // A wall that would pull an edge deep into its own room belongs to something else (a
  // neighbour's wall behind a closet's sliding door, say). Never let a snap collapse a room.
  const maxInward = (extent: number) => Math.max(3, extent * 0.3);
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const dx = q.x - p.x, dy = q.y - p.y;
    if (Math.abs(dy) <= Math.abs(dx) * tan3 && dx !== 0) {
      const y = (p.y + q.y) / 2;
      const inward = (cw * Math.sign(dx)) as 1 | -1; // interior is below (+y) for a left→right edge of a cw polygon
      const band = findWallBand(m, "h", y, p.x, q.x, o);
      const span: [number, number] = [Math.min(p.x, q.x), Math.max(p.x, q.x)];
      const coord = band ? (inward > 0 ? band.hi + 1 : band.lo) : y;
      if (!band || inward * (coord - y) > maxInward(maxY - minY)) return { axis: "h", coord: y, inward, wall: null, span };
      return { axis: "h", coord, inward, wall: band.hi - band.lo + 1, span };
    }
    if (Math.abs(dx) <= Math.abs(dy) * tan3 && dy !== 0) {
      const x = (p.x + q.x) / 2;
      const inward = (-cw * Math.sign(dy)) as 1 | -1; // interior is left (-x) for a top→bottom edge of a cw polygon
      const band = findWallBand(m, "v", x, p.y, q.y, o);
      const span: [number, number] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
      const coord = band ? (inward > 0 ? band.hi + 1 : band.lo) : x;
      if (!band || inward * (coord - x) > maxInward(maxX - minX)) return { axis: "v", coord: x, inward, wall: null, span };
      return { axis: "v", coord, inward, wall: band.hi - band.lo + 1, span };
    }
    return { axis: null, coord: 0, inward: 1, wall: null, span: [0, 0] };
  });
}

/** Rebuild corners from snapped edges: each corner takes x from its vertical edge and y from its horizontal one. */
export function polygonFromEdges(orig: Point[], edges: SnappedEdge[]): Point[] {
  const n = orig.length;
  return orig.map((p, j) => {
    const prev = edges[(j - 1 + n) % n], cur = edges[j];
    let { x, y } = p;
    for (const e of [prev, cur]) {
      if (e.axis === "h") y = e.coord;
      else if (e.axis === "v") x = e.coord;
    }
    return { x, y };
  });
}

/**
 * Open-plan rooms meet without a wall; make their shared edges land on the same line
 * so neighbours neither overlap nor leave a sliver between them.
 */
export function alignOpenEdges(rooms: SnappedEdge[][], tol: number) {
  const open: SnappedEdge[] = rooms.flat().filter((e) => e.axis && e.wall === null);
  for (let i = 0; i < open.length; i++) {
    for (let j = i + 1; j < open.length; j++) {
      const a = open[i], b = open[j];
      if (a.axis !== b.axis || a.inward === b.inward) continue;
      const overlap = Math.min(a.span[1], b.span[1]) - Math.max(a.span[0], b.span[0]);
      if (overlap <= 0 || Math.abs(a.coord - b.coord) > tol) continue;
      a.coord = b.coord = (a.coord + b.coord) / 2;
    }
  }
}

export interface SnappedOpening {
  axis: Axis;
  perp: number; // wall centerline (y for h, x for v)
  start: number; // along the wall
  end: number;
  thickness: number | null; // px, null if no wall was found
  gapFound: boolean; // the wall really is interrupted here
}

/**
 * Snap a door or window to its wall: center it on the wall and find the exact gap,
 * where the wall's thick ink is interrupted (doors leave a clear gap, windows thin lines).
 */
export function snapOpening(a: Point, b: Point, m: Mask, o: SnapOpts): SnappedOpening {
  const axis: Axis = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "h" : "v";
  const along = (p: Point) => (axis === "h" ? p.x : p.y);
  const perpOf = (p: Point) => (axis === "h" ? p.y : p.x);
  let start = Math.min(along(a), along(b)), end = Math.max(along(a), along(b));
  const len = Math.max(end - start, 4);
  const at = (perpOf(a) + perpOf(b)) / 2;

  // The wall continues on both sides of the opening, so look along a wider span.
  const band = findWallBand(m, axis, at, start - len, end + len, o, 0.3);
  if (!band) return { axis, perp: at, start, end, thickness: null, gapFound: false };

  const thick = band.hi - band.lo + 1;
  // In an outlined wall, the fill counts as wall too; a door leaves blank paper.
  const solid = (x: number, y: number) => dark(m, x, y) || (band.hollow && o.fill ? dark(o.fill, x, y) : 0);
  const fill = (s: number) => {
    let n = 0;
    for (let r = band.lo; r <= band.hi; r++) n += axis === "h" ? solid(s, r) : solid(r, s);
    return n / thick;
  };
  const mid = Math.round((start + end) / 2);
  let gapFound = false;
  if (fill(mid) < 0.6) {
    let s0 = mid, s1 = mid;
    const limit = len * 1.5;
    while (s0 - 1 > mid - limit && fill(s0 - 1) < 0.6) s0--;
    while (s1 + 1 < mid + limit && fill(s1 + 1) < 0.6) s1++;
    const gap = s1 - s0 + 1;
    if (gap >= len * 0.5 && gap <= len * 1.6) {
      start = s0;
      end = s1 + 1;
      gapFound = true;
    }
  }
  return { axis, perp: (band.lo + band.hi + 1) / 2, start, end, thickness: thick, gapFound };
}
