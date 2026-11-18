import type { Room } from "../../shared/schemas";
import { entryHex } from "../../shared/sw";
import { bbox } from "./geometry";

/** Which side of the room (as drawn on the plan) each edge faces: top, bottom, left or right. */
export function edgeSides(room: Room): string[] {
  const b = bbox(room.polygon);
  return room.polygon.map((p, i) => {
    const q = room.polygon[(i + 1) % room.polygon.length];
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    const d = { top: Math.abs(m.y - b.minY), bottom: Math.abs(m.y - b.maxY), left: Math.abs(m.x - b.minX), right: Math.abs(m.x - b.maxX) };
    return Object.entries(d).sort((x, y) => x[1] - y[1])[0][0];
  });
}

/**
 * Painted strips along the inside of the room's walls (inches), colored with the wall color,
 * or the accent color on the accent wall. Open edges (no wall) get no paint.
 */
export function paintSegments(room: Room, band: number): Array<{ pts: number[]; color: string }> {
  const paint = room.paint;
  if (!paint?.walls && !paint?.accent) return [];
  const poly = room.polygon;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    area += p.x * q.y - q.x * p.y;
  }
  const cw = area >= 0 ? 1 : -1;
  const sides = edgeSides(room);
  const out: Array<{ pts: number[]; color: string }> = [];
  poly.forEach((p, i) => {
    if (room.walls && room.walls[i] == null) return; // open to the next space
    const accent = paint.accent && paint.accentSide === sides[i];
    const entry = accent ? paint.accent : paint.walls;
    if (!entry) return;
    const q = poly[(i + 1) % poly.length];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 0.01) return;
    // Inward normal (the opposite of where roomWalls puts the walls).
    const nx = (cw * -(q.y - p.y)) / len, ny = (cw * (q.x - p.x)) / len;
    const ox = (nx * band) / 2, oy = (ny * band) / 2;
    out.push({ pts: [p.x + ox, p.y + oy, q.x + ox, q.y + oy], color: entryHex(entry) });
  });
  return out;
}
