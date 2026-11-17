import type { Item, Point, RawDetection, Room } from "../../shared/schemas";
import { bbox } from "../model/geometry";
import {
  alignOpenEdges,
  defaultOpts,
  polygonFromEdges,
  snapOpening,
  snapRoomEdges,
  type Mask,
  type SnappedOpening,
} from "./snap";

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
  notes: string;
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
 * @param mask    wall-ink mask of the original image
 * @param planPpi the plan's calibrated scale, if any
 */
export function buildProposal(raw: RawDetection, factor: number, mask: Mask, planPpi: number | null): Proposal {
  const up = (p: Point): Point => ({ x: p.x * factor, y: p.y * factor });
  const opts = defaultOpts(mask);

  // Rooms: snap edges to walls, then line up open-plan boundaries.
  const roomsPx = raw.rooms.filter((r) => r.polygon.length >= 3).map((r) => ({ ...r, polygon: r.polygon.map(up) }));
  const edges = roomsPx.map((r) => snapRoomEdges(r.polygon, mask, opts));
  alignOpenEdges(edges, opts.radius);

  // Doors and windows.
  type Op = { snapped: SnappedOpening; kind: string; hinge?: Point; swing?: Point | null };
  const ops: Op[] = [];
  for (const d of raw.doors) {
    const h = up(d.hinge), o = up(d.otherJamb);
    ops.push({ snapped: snapOpening(h, o, mask, opts), kind: d.kind, hinge: h, swing: d.swingToward ? up(d.swingToward) : null });
  }
  for (const w of raw.windows) ops.push({ snapped: snapOpening(up(w.start), up(w.end), mask, opts), kind: "window" });

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
      // Which end is the hinge? Whichever snapped end is nearer Claude's hinge point.
      const hAlong = o.hinge ? (s.axis === "h" ? o.hinge.x : o.hinge.y) : s.start;
      const [hEnd, oEnd] = Math.abs(hAlong - s.start) <= Math.abs(hAlong - s.end) ? [s.start, s.end] : [s.end, s.start];
      if (o.kind === "swing") {
        const pose = doorPose(ptAt(hEnd), ptAt(oEnd), o.swing ?? null);
        openings.push(baseItem({ shape: "door", category: "door", label: "Door", ...center, width, depth, ...pose }));
      } else {
        // Two leaves, each hinged at its own end, swinging the same way.
        const midAlong = (s.start + s.end) / 2;
        for (const [h, other] of [[s.start, midAlong], [s.end, midAlong]] as const) {
          const pose = doorPose(ptAt(h), ptAt(other), o.swing ?? null);
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

  return { ppi, ppiSource, scaleDisagreement, wallThickness, rooms, openings, notes: raw.notes };
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
