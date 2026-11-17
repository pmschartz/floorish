import type { FitLabel, Product } from "./schemas";

export interface FitTarget {
  width: number;
  depth: number;
  height: number | null;
  toleranceUnder: number;
  toleranceOver: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Compare a product's listed dimensions with the shape on the plan.
 * - fits: every dimension is at or under the shape
 * - tight: something is over, but by no more than toleranceOver
 * - too-big: something is over by more than toleranceOver
 * - unknown: width or depth wasn't listed
 * Width/depth may be swapped (listings aren't consistent); the better orientation wins.
 */
export function scoreFit(p: Pick<Product, "widthIn" | "depthIn" | "heightIn">, t: FitTarget): { fit: FitLabel; fitNote: string } {
  if (p.widthIn == null || p.depthIn == null || p.widthIn <= 0 || p.depthIn <= 0) {
    return { fit: "unknown", fitNote: "Listing didn't give width and depth. Check before buying." };
  }
  const direct = { w: p.widthIn, d: p.depthIn };
  const swapped = { w: p.depthIn, d: p.widthIn };
  const overBy = (o: { w: number; d: number }) => Math.max(o.w - t.width, o.d - t.depth);
  const best = overBy(swapped) < overBy(direct) ? swapped : direct;

  const overs: string[] = [];
  const check = (name: string, val: number, target: number) => {
    if (val > target) overs.push(`${r1(val - target)}" ${name}`);
    return val - target;
  };
  const wOver = check("too wide", best.w, t.width);
  const dOver = check("too deep", best.d, t.depth);
  const hOver = p.heightIn != null && t.height != null ? check("too tall", p.heightIn, t.height) : -Infinity;
  const worst = Math.max(wOver, dOver, hOver);

  if (worst > t.toleranceOver) return { fit: "too-big", fitNote: overs.join(", ") };
  if (worst > 0) return { fit: "tight", fitNote: `${overs.join(", ")}, within your tolerance` };

  const notes: string[] = [];
  if (t.width - best.w > t.toleranceUnder) notes.push(`${r1(t.width - best.w)}" narrower`);
  if (t.depth - best.d > t.toleranceUnder) notes.push(`${r1(t.depth - best.d)}" shallower`);
  return { fit: "fits", fitNote: notes.length ? `Fits; ${notes.join(", ")} than your shape` : "Fits the space" };
}
