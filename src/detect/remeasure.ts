import type { Item, Plan, Room } from "../../shared/schemas";
import { alignOpenEdges, defaultOpts, polygonFromEdges, snapRoomEdges, type Mask } from "./snap";
import { connectWalls, fitOpeningsToWalls } from "./walls";

/** Edges never move further than this when re-measuring (inches): it's a tidy-up, not a redo. */
const MAX_MOVE_IN = 10;

/**
 * Re-measure the walls of a plan's existing rooms against its floor plan image, without asking
 * Claude again: snap each edge to the inside face of its wall (outlined walls count as one wall),
 * make neighbouring rooms share the wall between them, and centre doors and windows in the
 * thicker walls. Edges you've made open (no wall) stay open. Free and undoable.
 */
export function remeasureWalls(plan: Plan, mask: Mask, fill: Mask): { rooms: Room[]; items: Item[]; wallThickness: number; changed: number } {
  const ppi = plan.pxPerInch;
  if (!ppi) return { rooms: plan.rooms, items: plan.items, wallThickness: plan.wallThickness, changed: 0 };
  const opts = defaultOpts(mask, fill);

  const edges = plan.rooms.map((r) => {
    const px = r.polygon.map((p) => ({ x: p.x * ppi, y: p.y * ppi }));
    const snapped = snapRoomEdges(px, mask, opts);
    return snapped.map((e, i) => {
      const p = px[i], q = px[(i + 1) % px.length];
      const was = e.axis === "h" ? (p.y + q.y) / 2 : (p.x + q.x) / 2;
      // Keep open edges open, and don't let an edge jump to some other wall.
      if (r.walls?.[i] === null) return { ...e, coord: was, wall: null };
      if (Math.abs(e.coord - was) > MAX_MOVE_IN * ppi) return { ...e, coord: was, wall: null };
      return e;
    });
  });
  alignOpenEdges(edges, opts.radius);

  let changed = 0;
  const snappedRooms = plan.rooms.map((r, ri) => {
    const px = r.polygon.map((p) => ({ x: p.x * ppi, y: p.y * ppi }));
    const poly = polygonFromEdges(px, edges[ri]).map((p) => ({ x: p.x / ppi, y: p.y / ppi }));
    const walls = edges[ri].map((e, i) => {
      if (r.walls?.[i] === null) return null; // connectWalls keeps it open only if it opens onto a room
      if (e.axis === null || e.wall === null) return r.walls?.[i] ?? plan.wallThickness;
      return Math.round((e.wall / ppi) * 2) / 2;
    });
    if (poly.some((p, i) => Math.hypot(p.x - r.polygon[i].x, p.y - r.polygon[i].y) > 0.5)) changed++;
    return { ...r, polygon: poly, walls };
  });

  const connected = connectWalls(snappedRooms, plan.wallThickness);
  const rooms = snappedRooms.map((r, i) => ({ ...r, walls: connected.walls[i] }));
  const items = fitOpeningsToWalls(plan.items, rooms, connected.walls);
  return { rooms, items, wallThickness: connected.typical, changed };
}
