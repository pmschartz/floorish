import type { Item, Point, RawDetection, Room } from "../../shared/schemas";
import { FIXTURE_LABEL } from "../catalog/furniture";
import { bbox, pointInPolygon, toWorld } from "../model/geometry";
import {
  alignOpenEdges,
  defaultOpts,
  polygonFromEdges,
  snapOpening,
  snapRoomEdges,
  type Mask,
  type SnappedOpening,
} from "./snap";
import { readDoubleSwing, readSwing, toXY, wallGaps, type Swing } from "./doors";

export type NewRoom = Omit<Room, "id">;
export type NewItem = Omit<Item, "id">;

export interface Proposal {
  ppi: number;
  ppiSource: "plan" | "printed" | "doors";
  /** Ratio between the scale implied by printed dimensions and the plan's own scale, when both exist. */
  scaleDisagreement: number | null;
  wallThickness: number; // inches
  rooms: NewRoom[];
  openings: NewItem[]; // doors, windows, and plain openings
  fixtures: NewItem[]; // counters, toilets, tubs, stairs…
  notes: string;
  correctedDoors: number; // swings read from the drawing that differ from Claude's reading
  addedDoors: number; // doors and openings found by scanning the walls
  addedWindows: number; // windows found by scanning exterior walls
  /** For each door that swings into space no room covers, the room on its other side. */
  orphanDoorsNear: string[];
}

export const TYPICAL_DOOR_IN = 32;

const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function baseItem(partial: Partial<NewItem> & Pick<NewItem, "shape" | "category" | "label" | "x" | "y" | "width" | "depth" | "rotation">): NewItem {
  return {
    catalogKey: partial.shape === "door" ? "door-30" : partial.shape === "window" ? "window" : "custom",
    height: null,
    flip: false,
    color: "",
    status: "existing",
    notes: "",
    shopResults: null,
    ...partial,
  };
}

/** Door rotation/flip so the hinge and swing side match the drawing. */
export function doorPose(hinge: Point, other: Point, swingToward: Point | null): { rotation: number; flip: boolean } {
  const len = Math.hypot(other.x - hinge.x, other.y - hinge.y) || 1;
  const u = { x: (other.x - hinge.x) / len, y: (other.y - hinge.y) / len };
  const v = { x: -u.y, y: u.x }; // the door's front for rotation = angle(u)
  const mid = { x: (hinge.x + other.x) / 2, y: (hinge.y + other.y) / 2 };
  const side = swingToward ? (swingToward.x - mid.x) * v.x + (swingToward.y - mid.y) * v.y : 1;
  const ang = side >= 0 ? Math.atan2(u.y, u.x) : Math.atan2(-u.y, -u.x);
  const deg = ((Math.round((ang * 180) / Math.PI / 90) * 90) % 360 + 360) % 360;
  return { rotation: deg, flip: side < 0 };
}

const KIND_LABEL: Record<RawDetection["doors"][number]["kind"], string> = {
  swing: "Door",
  double: "Double door",
  sliding: "Sliding door",
  pocket: "Pocket door",
  bifold: "Bifold door",
  opening: "Opening",
  garage: "Garage door",
};

/**
 * Turn Claude's rough reading of the plan into precise rooms and openings:
 * snap to the walls found in the image, work out the scale, convert to inches.
 *
 * @param raw     Claude's detection, in pixels of the image it was sent
 * @param factor  original image px per sent-image px (≥ 1 when the image was downscaled)
 * @param mask    wall-ink mask of the original image (dark, thick strokes)
 * @param planPpi the plan's calibrated scale, if any
 * @param inkMask all line work, including thin gray lines like door arcs. When given,
 *                door swings are read from the drawn arcs and missed doors are searched for.
 */
export function buildProposal(raw: RawDetection, factor: number, mask: Mask, planPpi: number | null, inkMask?: Mask): Proposal {
  const up = (p: Point): Point => ({ x: p.x * factor, y: p.y * factor });
  const opts = defaultOpts(mask);

  // Rooms: snap edges to walls, then line up open-plan boundaries.
  const roomsPx = raw.rooms.filter((r) => r.polygon.length >= 3).map((r) => ({ ...r, polygon: r.polygon.map(up) }));
  const edges = roomsPx.map((r) => snapRoomEdges(r.polygon, mask, opts));
  alignOpenEdges(edges, opts.radius);

  // Doors and windows.
  type Op = {
    snapped: SnappedOpening;
    kind: string;
    hinge?: Point; // Claude's hinge guess
    otherJamb?: Point;
    swing?: Point | null; // Claude's swing guess
    resolved?: Swing; // hinge and swing read from the drawn arc
    doubleSide?: 1 | -1;
    drop?: boolean;
    found?: boolean; // found by scanning the walls, not by Claude
  };
  const ops: Op[] = [];
  for (const d of raw.doors) {
    const h = up(d.hinge), o = up(d.otherJamb);
    ops.push({ snapped: snapOpening(h, o, mask, opts), kind: d.kind, hinge: h, otherJamb: o, swing: d.swingToward ? up(d.swingToward) : null });
  }
  for (const w of raw.windows) ops.push({ snapped: snapOpening(up(w.start), up(w.end), mask, opts), kind: "window" });

  // Read each door's hinge and swing from its arc rather than trusting the guess.
  let corrected = 0;
  if (inkMask) {
    /**
     * A door reported a little off its real wall (no gap or no arc where it was placed):
     * slide it perpendicular to the wall until it lands on a gap with its door drawn.
     */
    // Doors in short walls (a pantry, a closet) leave too little wall to find, so use the
    // drawn door itself: try each line near the reported one and keep where the arcs fit best.
    const prelimWall = median(edges.flat().map((e) => e.wall).filter((t): t is number => t != null));
    const relocate = (o: Op): boolean => {
      if (!o.hinge || !o.otherJamb) return false;
      const axis: "h" | "v" = Math.abs(o.otherJamb.x - o.hinge.x) >= Math.abs(o.otherJamb.y - o.hinge.y) ? "h" : "v";
      const along = (p: Point) => (axis === "h" ? p.x : p.y);
      const perpOf = (p: Point) => (axis === "h" ? p.y : p.x);
      const a0 = Math.min(along(o.hinge), along(o.otherJamb)), a1 = Math.max(along(o.hinge), along(o.otherJamb));
      const p0 = (perpOf(o.hinge) + perpOf(o.otherJamb)) / 2;
      const t = Number.isFinite(prelimWall) ? Math.round(prelimWall) : 4;
      type Cand = { s: SnappedOpening; score: number; jamb: number; swing?: Swing; side?: 1 | -1 };
      const cands: Cand[] = [];
      for (let p = Math.round(p0 - opts.radius * 3); p <= p0 + opts.radius * 3; p++) {
        const [start, end] = refineGap(mask, axis, p, t, a0, a1);
        const s: SnappedOpening = { axis, perp: p, start, end, thickness: t, gapFound: true };
        const jamb = jambInk(mask, axis, p, t, start, end);
        if (o.kind === "double") {
          const d = readDoubleSwing(inkMask, s);
          if (d) cands.push({ s, score: d.score, jamb, side: d.side });
        } else {
          const sw = readSwing(inkMask, s);
          if (sw && sw.score >= 0.6) cands.push({ s, score: sw.score, jamb, swing: sw });
        }
      }
      if (!cands.length) return false;
      // Several neighbouring lines fit the arc about as well; take the one centered on the
      // wall stubs either side of the doorway.
      const top = Math.max(...cands.map((c) => c.score));
      const best = cands.filter((c) => c.score >= top - 0.06).sort((a, b) => b.jamb - a.jamb || Math.abs(a.s.perp - p0) - Math.abs(b.s.perp - p0))[0];
      o.snapped = best.s;
      if (best.side) o.doubleSide = best.side;
      if (best.swing) o.resolved = best.swing;
      return true;
    };
    for (const o of ops) {
      const s = o.snapped;
      if (o.kind === "window" || o.kind === "garage") continue;
      const isDoor = o.kind === "swing" || o.kind === "double";
      if (!s.gapFound || s.thickness == null) {
        // No gap in the wall here: the door is on the wrong wall. Look nearby, else drop it
        // (the wall scan below can still find the real doorway).
        if (isDoor) {
          if (relocate(o)) corrected++;
          else o.drop = true;
        }
        continue;
      }
      if (o.kind === "double") {
        const d = readDoubleSwing(inkMask, s);
        if (d) o.doubleSide = d.side;
        else if (relocate(o)) corrected++;
        else o.drop = true;
        continue;
      }
      const sw = readSwing(inkMask, s);
      if (!sw || (o.kind !== "swing" && sw.score < 0.6)) continue;
      if (o.kind === "swing" && o.hinge) {
        const hAlong = s.axis === "h" ? o.hinge.x : o.hinge.y;
        const guessStart = Math.abs(hAlong - s.start) <= Math.abs(hAlong - s.end);
        const guessSide = o.swing ? Math.sign((s.axis === "h" ? o.swing.y : o.swing.x) - s.perp) : 0;
        if (guessStart !== sw.hingeAtStart || (guessSide !== 0 && guessSide !== sw.side)) corrected++;
      } else if (o.kind !== "swing") {
        corrected++; // drawn as a swing door, reported as an opening
      }
      o.kind = "swing";
      o.resolved = sw;
    }
  }

  // Wall thickness (px) from everything that found a wall.
  const thicknesses = [
    ...edges.flat().map((e) => e.wall).filter((t): t is number => t != null),
    ...ops.map((o) => o.snapped.thickness).filter((t): t is number => t != null),
  ];
  const wallPx = median(thicknesses);

  // A wall that's mostly opening (a hall wall, a garage front) has too little ink to be
  // found on its own. If an opening sits on an "open" edge, it's a wall with an opening in it.
  for (const roomEdges of edges) {
    for (const e of roomEdges) {
      if (!e.axis || e.wall !== null) continue;
      const hit = ops.find(({ snapped: s }) => {
        const t = s.thickness ?? wallPx;
        return s.axis === e.axis && Number.isFinite(t) &&
          Math.min(s.end, e.span[1]) - Math.max(s.start, e.span[0]) > 0 &&
          Math.abs(s.perp - e.coord) <= t / 2 + opts.radius;
      });
      if (hit) {
        const s = hit.snapped;
        e.wall = s.thickness ?? Math.round(wallPx);
        if (s.thickness != null) e.coord = s.perp + (e.inward * s.thickness) / 2;
      }
    }
  }

  // Closets: a sliding door often spans nearly the whole front, leaving almost no wall,
  // and is drawn as a thin track line. An "open" closet edge with such a line along it is
  // a wall with a sliding door in it.
  let added = 0, addedWindows = 0;
  if (inkMask && Number.isFinite(wallPx)) {
    const t = Math.round(wallPx);
    const lineAt = (axis: "h" | "v", p: number, a: number, b: number) => {
      let hits = 0, n = 0;
      for (let s = a; s <= b; s++, n++) {
        const x = axis === "h" ? s : p, y = axis === "h" ? p : s;
        if (x >= 0 && y >= 0 && x < inkMask.w && y < inkMask.h && inkMask.data[y * inkMask.w + x]) hits++;
      }
      return n ? hits / n : 0;
    };
    roomsPx.forEach((r, ri) => {
      if (r.type !== "closet") return;
      for (const e of edges[ri]) {
        if (!e.axis || e.wall !== null) continue;
        const a = Math.round(e.span[0] + (e.span[1] - e.span[0]) * 0.1), b = Math.round(e.span[1] - (e.span[1] - e.span[0]) * 0.1);
        let bestP = 0, bestCov = 0;
        for (let p = Math.round(e.coord - opts.radius); p <= e.coord + opts.radius; p++) {
          const cov = lineAt(e.axis, p, a, b);
          if (cov > bestCov) { bestCov = cov; bestP = p; }
        }
        if (bestCov < 0.6) continue;
        // This edge and the neighbour's matching open edge become the two faces of one wall.
        for (const other of edges.flat()) {
          if (other.axis !== e.axis || other.wall !== null || other.inward === e.inward) continue;
          if (Math.min(other.span[1], e.span[1]) - Math.max(other.span[0], e.span[0]) <= 0) continue;
          if (Math.abs(other.coord - bestP) > opts.radius) continue;
          other.wall = t;
          other.coord = bestP + (other.inward * t) / 2;
        }
        e.wall = t;
        e.coord = bestP + (e.inward * t) / 2;
        const inset = Math.max(t, (e.span[1] - e.span[0]) * 0.04);
        ops.push({
          snapped: { axis: e.axis, perp: bestP, start: e.span[0] + inset, end: e.span[1] - inset, thickness: t, gapFound: true },
          kind: "sliding",
          found: true,
        });
        added++;
      }
    });
  }
  const polys = roomsPx.map((r, i) => polygonFromEdges(r.polygon, edges[i]));

  // Scale.
  const printed: number[] = [];
  for (const dl of raw.dimensionLines) {
    const a = up(dl.start), b = up(dl.end);
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    if (dl.inches > 12 && px > 20) printed.push(px / dl.inches);
  }
  roomsPx.forEach((r, i) => {
    if (!r.labeledWidthIn || !r.labeledDepthIn) return;
    const b = bbox(polys[i]);
    let [w, d] = [r.labeledWidthIn, r.labeledDepthIn];
    // Labels aren't always horizontal-first; pair them the way that agrees best.
    const direct = Math.abs(Math.log((b.width / w) / (b.height / d)));
    const swapped = Math.abs(Math.log((b.width / d) / (b.height / w)));
    if (swapped < direct) [w, d] = [d, w];
    printed.push(b.width / w, b.height / d);
  });
  const doorWidths = ops.filter((o) => o.kind === "swing").map((o) => o.snapped.end - o.snapped.start);

  let ppi: number, ppiSource: Proposal["ppiSource"];
  const printedPpi = median(printed);
  if (planPpi) {
    ppi = planPpi;
    ppiSource = "plan";
  } else if (printed.length) {
    ppi = printedPpi;
    ppiSource = "printed";
  } else if (doorWidths.length) {
    ppi = median(doorWidths) / TYPICAL_DOOR_IN;
    ppiSource = "doors";
  } else {
    throw new Error("Couldn't work out the scale: the plan has no printed dimensions or doors to go by. Calibrate first, then detect again.");
  }
  const scaleDisagreement = planPpi && printed.length ? printedPpi / planPpi : null;

  // Look along every wall for gaps nobody reported. A gap with a door arc is a door;
  // otherwise a gap in an interior wall is a sliding door or opening, and a gap with
  // thin lines in an exterior wall is a window.
  if (inkMask) {
    const minLen = 14 * ppi, maxSingle = 44 * ppi, maxDouble = 76 * ppi, maxLen = 150 * ppi;
    const inAnyRoom = (p: Point) => polys.some((poly) => pointInPolygon(p, poly, 0));
    edges.forEach((roomEdges, ri) =>
      roomEdges.forEach((e, ei) => {
        if (!e.axis || e.wall == null) return;
        const poly = polys[ri];
        const a = poly[ei], b = poly[(ei + 1) % poly.length];
        const [from, to] = e.axis === "h" ? [a.x, b.x] : [a.y, b.y];
        const t = e.wall;
        const lo = e.inward > 0 ? e.coord - t : e.coord;
        const perp = lo + t / 2;
        const beyond = perp - e.inward * (t / 2 + Math.max(4, t)); // just past the wall, away from this room
        for (const [s0, s1] of wallGaps(mask, e.axis, lo, lo + t - 1, from, to, minLen, maxLen)) {
          const taken = ops.some(({ snapped: o, drop }) =>
            !drop && o.axis === e.axis && Math.abs(o.perp - perp) <= t + 2 &&
            Math.min(o.end, s1) - Math.max(o.start, s0) > (s1 - s0) * 0.3);
          if (taken) continue;
          const len = s1 - s0;
          const snapped: SnappedOpening = { axis: e.axis, perp, start: s0, end: s1, thickness: t, gapFound: true };
          if (len >= 20 * ppi && len <= maxSingle) {
            const sw = readSwing(inkMask, snapped);
            if (sw && sw.score >= 0.55) { ops.push({ snapped, kind: "swing", resolved: sw, found: true }); added++; continue; }
          } else if (len > maxSingle && len <= maxDouble) {
            const d = readDoubleSwing(inkMask, snapped);
            if (d) { ops.push({ snapped, kind: "double", doubleSide: d.side, found: true }); added++; continue; }
          }
          // No arc. What's drawn in the gap, and what's on the other side of the wall?
          let lines = 0, n = 0;
          for (let s = s0; s < s1; s++) for (let r = lo; r < lo + t; r++, n++) lines += mask.data[(e.axis === "h" ? r * mask.w + s : s * mask.w + r)] ?? 0;
          const hasLines = n > 0 && lines / n > 0.06;
          const exterior = !inAnyRoom(toXY(e.axis, (s0 + s1) / 2, beyond));
          if (exterior) {
            if (hasLines) { ops.push({ snapped, kind: "window", found: true }); addedWindows++; }
          } else if (len >= 20 * ppi && len <= 100 * ppi) {
            ops.push({ snapped, kind: hasLines ? "sliding" : "opening", found: true });
            added++;
          }
        }
      }),
    );
  }

  const inch = (px: number) => px / ppi;
  const wallThickness = Number.isFinite(wallPx) ? Math.max(2, Math.round(inch(wallPx) * 2) / 2) : 5;

  const rooms: NewRoom[] = roomsPx.map((r, i) => ({
    name: r.name,
    type: r.type,
    polygon: polys[i].map((p) => ({ x: inch(p.x), y: inch(p.y) })),
    walls: edges[i].map((e) => (e.axis === null ? wallThickness : e.wall === null ? null : Math.round(inch(e.wall) * 2) / 2)),
  }));

  const openings: NewItem[] = [];
  for (const o of ops) {
    if (o.drop) continue;
    const s = o.snapped;
    const depth = s.thickness ? Math.max(2, inch(s.thickness)) : wallThickness;
    const width = inch(s.end - s.start);
    if (width < 6) continue;
    const c = (s.start + s.end) / 2;
    const center = s.axis === "h" ? { x: inch(c), y: inch(s.perp) } : { x: inch(s.perp), y: inch(c) };
    const ptAt = (along: number): Point => (s.axis === "h" ? { x: along, y: s.perp } : { x: s.perp, y: along });

    if (o.kind === "window") {
      openings.push(baseItem({ shape: "window", category: "window", label: "Window", ...center, width, depth, rotation: s.axis === "h" ? 0 : 90 }));
    } else if (o.kind === "swing" || o.kind === "double") {
      const midAlong = (s.start + s.end) / 2;
      const sidePoint = (side: 1 | -1) => toXY(s.axis, midAlong, s.perp + side * 10);
      if (o.kind === "swing") {
        let hEnd: number, oEnd: number, swingPt: Point | null;
        if (o.resolved) {
          [hEnd, oEnd] = o.resolved.hingeAtStart ? [s.start, s.end] : [s.end, s.start];
          swingPt = sidePoint(o.resolved.side);
        } else {
          // No arc to read: whichever snapped end is nearer Claude's hinge point.
          const hAlong = o.hinge ? (s.axis === "h" ? o.hinge.x : o.hinge.y) : s.start;
          [hEnd, oEnd] = Math.abs(hAlong - s.start) <= Math.abs(hAlong - s.end) ? [s.start, s.end] : [s.end, s.start];
          swingPt = o.swing ?? null;
        }
        const pose = doorPose(ptAt(hEnd), ptAt(oEnd), swingPt);
        openings.push(baseItem({ shape: "door", category: "door", label: "Door", ...center, width, depth, ...pose }));
      } else {
        // Two leaves, each hinged at its own end, swinging the same way.
        const swingPt = o.doubleSide ? sidePoint(o.doubleSide) : o.swing ?? null;
        for (const [h, other] of [[s.start, midAlong], [s.end, midAlong]] as const) {
          const pose = doorPose(ptAt(h), ptAt(other), swingPt);
          const lc = (h + other) / 2;
          const lcenter = s.axis === "h" ? { x: inch(lc), y: inch(s.perp) } : { x: inch(s.perp), y: inch(lc) };
          openings.push(baseItem({ shape: "door", category: "door", label: "Double door", ...lcenter, width: width / 2, depth, ...pose }));
        }
      }
    } else {
      openings.push(baseItem({
        shape: "opening", category: "opening", label: KIND_LABEL[o.kind as keyof typeof KIND_LABEL] ?? "Opening",
        ...center, width, depth, rotation: s.axis === "h" ? 0 : 90,
      }));
    }
  }

  // Doors that swing into space no room covers: a room outline is missing a corner (a nook
  // in front of a door, say). Flag them so the review can say where to look.
  const roomsIn = rooms.map((r) => r.polygon);
  const orphanDoorsNear: string[] = [];
  for (const d of openings) {
    if (d.shape !== "door") continue;
    const front = toWorld(d, { x: 0, y: d.depth / 2 + d.width * 0.4 });
    if (roomsIn.some((poly) => pointInPolygon(front, poly, 0))) continue;
    // Nothing further out either: an exterior door swinging outdoors, not a gap between rooms.
    const further = toWorld(d, { x: 0, y: d.depth / 2 + d.width * 1.6 });
    if (!roomsIn.some((poly) => pointInPolygon(further, poly, 0))) continue;
    const back = toWorld(d, { x: 0, y: -d.depth / 2 - 6 });
    const near = rooms.find((r) => pointInPolygon(back, r.polygon, 0));
    orphanDoorsNear.push(near?.name ?? "a door");
  }

  // Fixtures: push the wall side flush against the nearest wall face, then orient so the
  // fixture's front faces away from that wall.
  const fixtures: NewItem[] = [];
  const wallEdges = edges.flat().filter((e) => e.axis && e.wall != null);
  const tol = opts.radius * 1.5;
  for (const f of raw.fixtures ?? []) {
    let x0 = Math.min(f.box.x0, f.box.x1) * factor, x1 = Math.max(f.box.x0, f.box.x1) * factor;
    let y0 = Math.min(f.box.y0, f.box.y1) * factor, y1 = Math.max(f.box.y0, f.box.y1) * factor;
    if (x1 - x0 < 3 || y1 - y0 < 3) continue;
    const flush = (axis: "h" | "v", inward: 1 | -1, side: number, span: [number, number]) => {
      let best: number | null = null;
      for (const e of wallEdges) {
        if (e.axis !== axis || e.inward !== inward) continue;
        if (Math.min(e.span[1], span[1]) - Math.max(e.span[0], span[0]) <= 0) continue;
        if (Math.abs(e.coord - side) <= tol && (best === null || Math.abs(e.coord - side) < Math.abs(best - side))) best = e.coord;
      }
      return best === null ? 0 : best - side;
    };
    if (f.against === "top") { const d = flush("h", 1, y0, [x0, x1]); y0 += d; y1 += d; }
    if (f.against === "bottom") { const d = flush("h", -1, y1, [x0, x1]); y0 += d; y1 += d; }
    if (f.against === "left") { const d = flush("v", 1, x0, [y0, y1]); x0 += d; x1 += d; }
    if (f.against === "right") { const d = flush("v", -1, x1, [y0, y1]); x0 += d; x1 += d; }
    const W = x1 - x0, H = y1 - y0;
    const sideways = f.against === "left" || f.against === "right";
    const rotation = f.against === "bottom" ? 180 : f.against === "left" ? 270 : f.against === "right" ? 90 : 0;
    fixtures.push(baseItem({
      shape: "fixture",
      category: f.kind,
      label: FIXTURE_LABEL[f.kind],
      catalogKey: `fixture-${f.kind.replace(" ", "-")}`,
      x: inch((x0 + x1) / 2),
      y: inch((y0 + y1) / 2),
      width: inch(sideways ? H : W),
      depth: inch(sideways ? W : H),
      rotation,
    }));
  }

  return {
    ppi, ppiSource, scaleDisagreement, wallThickness, rooms, openings, fixtures,
    notes: raw.notes, correctedDoors: corrected, addedDoors: added, addedWindows, orphanDoorsNear,
  };
}

/**
 * Detected rooms that mostly overlap a room you'd already traced take that room's name
 * and type, since you chose them (a bedroom used as an office, say).
 */
export function carryOverNames(rooms: NewRoom[], existing: Room[]): { rooms: NewRoom[]; detectedName: (string | null)[] } {
  const iou = (a: Point[], b: Point[]) => {
    const A = bbox(a), B = bbox(b);
    const w = Math.min(A.maxX, B.maxX) - Math.max(A.minX, B.minX);
    const h = Math.min(A.maxY, B.maxY) - Math.max(A.minY, B.minY);
    if (w <= 0 || h <= 0) return 0;
    const inter = w * h;
    return inter / (A.width * A.height + B.width * B.height - inter);
  };
  const pairs: Array<{ i: number; j: number; score: number }> = [];
  rooms.forEach((r, i) =>
    existing.forEach((e, j) => {
      const score = iou(r.polygon, e.polygon);
      if (score >= 0.5) pairs.push({ i, j, score });
    }),
  );
  pairs.sort((a, b) => b.score - a.score);
  const usedI = new Set<number>(), usedJ = new Set<number>();
  const out = rooms.map((r) => ({ ...r }));
  const detectedName: (string | null)[] = rooms.map(() => null);
  for (const { i, j } of pairs) {
    if (usedI.has(i) || usedJ.has(j)) continue;
    usedI.add(i);
    usedJ.add(j);
    const e = existing[j];
    if (e.name.trim() && e.name !== out[i].name) {
      detectedName[i] = out[i].name;
      out[i].name = e.name;
      out[i].type = e.type;
    }
  }
  return { rooms: out, detectedName };
}

/**
 * Exact ends of a doorway on the wall line at `perp`: grow outward from the middle of the
 * reported span while the wall's ink is missing. Keeps the reported ends if there's no gap.
 */
function refineGap(m: Mask, axis: "h" | "v", perp: number, t: number, a0: number, a1: number): [number, number] {
  const lo = Math.round(perp - t / 2), hi = lo + t - 1;
  const fill = (s: number) => {
    let k = 0;
    for (let r = lo; r <= hi; r++) {
      const x = axis === "h" ? s : r, y = axis === "h" ? r : s;
      if (x >= 0 && y >= 0 && x < m.w && y < m.h) k += m.data[y * m.w + x];
    }
    return k / t;
  };
  const mid = Math.round((a0 + a1) / 2);
  if (fill(mid) >= 0.5) return [a0, a1];
  const reach = (a1 - a0) * 0.75;
  let s0 = mid, s1 = mid;
  while (s0 - 1 > a0 - reach && fill(s0 - 1) < 0.5) s0--;
  while (s1 + 1 < a1 + reach && fill(s1 + 1) < 0.5) s1++;
  return [s0, s1 + 1];
}

/** How much wall ink sits right beside a doorway's two ends on the line at `perp` (0–1). */
function jambInk(m: Mask, axis: "h" | "v", perp: number, t: number, start: number, end: number): number {
  const lo = Math.round(perp - t / 2), hi = lo + t - 1;
  let k = 0, n = 0;
  for (const s of [start - 3, start - 2, start - 1, end, end + 1, end + 2]) {
    for (let r = lo; r <= hi; r++) {
      const x = axis === "h" ? s : r, y = axis === "h" ? r : s;
      n++;
      if (x >= 0 && y >= 0 && x < m.w && y < m.h) k += m.data[y * m.w + x];
    }
  }
  return k / n;
}
