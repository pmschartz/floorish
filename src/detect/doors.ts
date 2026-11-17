import type { Point } from "../../shared/schemas";
import type { Axis, Mask, SnappedOpening } from "./snap";

const ink = (m: Mask, x: number, y: number) => {
  const xi = Math.round(x), yi = Math.round(y);
  return xi >= 0 && yi >= 0 && xi < m.w && yi < m.h ? m.data[yi * m.w + xi] : 0;
};

/** Any ink within `r` px of (x, y)? Arcs are thin and anti-aliased, so allow a little slack. */
const near = (m: Mask, x: number, y: number, r: number) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (ink(m, x + dx, y + dy)) return true;
  return false;
};

export interface Swing {
  hingeAtStart: boolean; // hinge at the opening's `start` end (else at `end`)
  side: 1 | -1; // leaf swings toward +perp (down / right) or -perp (up / left)
  score: number; // 0–1, how much of the drawn arc and leaf was found
}

/** Where a point at (along, perp) lands in the image for a wall running along `axis`. */
export const toXY = (axis: Axis, along: number, perp: number): Point => (axis === "h" ? { x: along, y: perp } : { x: perp, y: along });

/**
 * Score one way a door could be drawn: a leaf of length `r` standing perpendicular to the
 * wall at the hinge, and a quarter-circle arc from its tip back to the other jamb.
 */
export function swingScore(m: Mask, axis: Axis, perp: number, thickness: number, hinge: number, other: number, side: 1 | -1, r = Math.abs(other - hinge)): number {
  const dirA = Math.sign(other - hinge) || 1;
  const face = perp + (side * thickness) / 2; // the wall face the door swings away from
  const slack = Math.max(1, Math.round(r * 0.05));
  let hits = 0, n = 0;
  // Arc, skipping the ends where it meets the wall and the leaf.
  for (let i = 3; i <= 27; i++) {
    const a = (i / 30) * (Math.PI / 2);
    const p = toXY(axis, hinge + dirA * r * Math.cos(a), face + side * r * Math.sin(a));
    n++;
    if (near(m, p.x, p.y, slack)) hits++;
  }
  const arc = hits / n;
  hits = 0; n = 0;
  for (let i = 3; i <= 18; i++) {
    const p = toXY(axis, hinge, face + side * r * (i / 20));
    n++;
    if (near(m, p.x, p.y, slack)) hits++;
  }
  const leaf = hits / n;
  return arc * 0.7 + leaf * 0.3;
}

/** Work out which end is hinged and which way the door swings from the arc drawn on the plan. */
export function readSwing(m: Mask, op: SnappedOpening): Swing | null {
  const t = op.thickness ?? 0;
  const cands: Swing[] = [];
  for (const hingeAtStart of [true, false]) {
    for (const side of [1, -1] as const) {
      const [h, o] = hingeAtStart ? [op.start, op.end] : [op.end, op.start];
      cands.push({ hingeAtStart, side, score: swingScore(m, op.axis, op.perp, t, h, o, side) });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const [best, second] = cands;
  if (best.score < 0.5 || best.score - second.score < 0.12) return null;
  return best;
}

/** Double doors: two leaves hinged at both ends, meeting in the middle. Returns the swing side if drawn. */
export function readDoubleSwing(m: Mask, op: SnappedOpening): { side: 1 | -1; score: number } | null {
  const t = op.thickness ?? 0;
  const mid = (op.start + op.end) / 2;
  const score = (side: 1 | -1) =>
    (swingScore(m, op.axis, op.perp, t, op.start, mid, side) + swingScore(m, op.axis, op.perp, t, op.end, mid, side)) / 2;
  const down = score(1), up = score(-1);
  const best = Math.max(down, up);
  if (best < 0.5 || Math.abs(down - up) < 0.12) return null;
  return { side: down > up ? 1 : -1, score: best };
}

/**
 * Gaps in a wall: stretches along the wall's band [lo, hi] where the wall ink is mostly
 * missing. Doors leave clear gaps; windows leave thin lines, which still count as gaps.
 */
export function wallGaps(m: Mask, axis: Axis, lo: number, hi: number, from: number, to: number, minLen: number, maxLen: number): Array<[number, number]> {
  const thick = hi - lo + 1;
  const fill = (s: number) => {
    let k = 0;
    for (let r = lo; r <= hi; r++) k += axis === "h" ? ink(m, s, r) : ink(m, r, s);
    return k / thick;
  };
  const out: Array<[number, number]> = [];
  let runStart: number | null = null;
  const a = Math.ceil(Math.min(from, to)), b = Math.floor(Math.max(from, to));
  for (let s = a; s <= b + 1; s++) {
    const open = s <= b && fill(s) < 0.5;
    if (open && runStart === null) runStart = s;
    if (!open && runStart !== null) {
      const len = s - runStart;
      // Ignore gaps touching the ends of the span: those are corners, not doorways.
      if (len >= minLen && len <= maxLen && runStart > a + 1 && s < b) out.push([runStart, s]);
      runStart = null;
    }
  }
  return out;
}
