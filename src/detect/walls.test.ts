import { describe, expect, it } from "vitest";
import type { Item } from "../../shared/schemas";
import { rectLocal } from "../model/geometry";
import { defaultOpts, findWallBand, type Mask } from "./snap";
import { alignWalls, connectWalls, fitOpeningsToWalls, simplifyOutline, snapOpeningToWall } from "./walls";

/** A 1000×1000 image with one horizontal wall at rows [y0, y1], drawn as described. */
function drawWall(kind: "solid" | "outlined" | "double", y0: number, y1: number) {
  const w = 1000, h = 1000;
  const mask: Mask = { w, h, data: new Uint8Array(w * h) };
  const fill: Mask = { w, h, data: new Uint8Array(w * h) };
  for (let y = y0; y <= y1; y++) {
    const edge = y <= y0 + 1 || y >= y1 - 1;
    for (let x = 10; x < 990; x++) {
      if (kind === "solid" || edge) mask.data[y * w + x] = 1;
      if (kind !== "double" || edge) fill.data[y * w + x] = 1; // "double": blank paper between the lines
    }
  }
  return { mask, fill };
}

describe("finding outlined walls", () => {
  it("treats two outline lines with a fill between them as one wall", () => {
    const { mask, fill } = drawWall("outlined", 500, 511);
    expect(findWallBand(mask, "h", 499, 10, 990, defaultOpts(mask, fill))).toEqual({ lo: 500, hi: 511, hollow: true });
  });

  it("doesn't join two lines with blank paper between them", () => {
    const { mask, fill } = drawWall("double", 500, 511);
    const band = findWallBand(mask, "h", 499, 10, 990, defaultOpts(mask, fill))!;
    expect(band.hi - band.lo + 1).toBeLessThan(5);
  });

  it("still finds solid walls the same way", () => {
    const { mask, fill } = drawWall("solid", 500, 506);
    expect(findWallBand(mask, "h", 499, 10, 990, defaultOpts(mask, fill))).toEqual({ lo: 500, hi: 506 });
  });
});

describe("connecting walls", () => {
  const a = { polygon: rectLocal(0, 0, 100, 100), walls: [1.5, 1.5, 1.5, 1.5] }; // left room
  const b = { polygon: rectLocal(105, 0, 200, 100), walls: [1.5, 1.5, 1.5, 1.5] }; // 5" to the right

  it("fills the gap between two rooms with one wall, and thickens hairline outside walls", () => {
    const outside = { polygon: rectLocal(0, 200, 100, 300), walls: [7, 7, 7, 7] };
    const { walls } = connectWalls([a, b, outside]);
    const shared = (ws: (number | null)[], x: number, poly: { x: number }[]) => ws[poly.findIndex((p, i) => p.x === x && poly[(i + 1) % 4].x === x)];
    expect(shared(walls[0], 100, a.polygon)).toBe(5);
    expect(shared(walls[1], 105, b.polygon)).toBe(5);
    // a's other walls face nothing; measured as hairlines, so they take the outside wall (7").
    expect(walls[0].filter((t) => t === 7).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps open edges open and a thin divider between rooms that touch", () => {
    const touching = { polygon: rectLocal(100, 0, 200, 100), walls: [2, 2, 2, null] };
    const { walls } = connectWalls([{ ...a, walls: [2, 2, 2, 2] }, touching]);
    expect(walls[1]).toContain(null);
    expect(walls[0]).toContain(2);
  });
});

describe("fitting openings to walls", () => {
  it("centres a door in the wall it sits in, as deep as the wall", () => {
    const rooms = [{ polygon: rectLocal(0, 0, 100, 100) }, { polygon: rectLocal(0, 106, 100, 200) }];
    const walls = connectWalls(rooms.map((r) => ({ ...r, walls: [2, 2, 2, 2] }))).walls;
    const door = { shape: "door", x: 50, y: 101, width: 32, depth: 2, rotation: 0 } as Pick<Item, "shape" | "x" | "y" | "width" | "depth" | "rotation">;
    const [fitted] = fitOpeningsToWalls([door], rooms, walls);
    expect(fitted.y).toBe(103);
    expect(fitted.depth).toBe(6);
  });
});

describe("open edges", () => {
  it("become outside walls when no room is on the other side", () => {
    const lone = { polygon: rectLocal(0, 0, 100, 100), walls: [7, 7, null, 7] };
    expect(connectWalls([lone]).walls[0]).toEqual([7, 7, 7, 7]);
  });
});

describe("lining up walls", () => {
  it("puts rooms along the same wall on one straight line", () => {
    const rooms = [
      { polygon: rectLocal(46, 0, 200, 170), walls: [7, 7, 7, 7] }, // bedroom (longest wall)
      { polygon: rectLocal(40, 170, 200, 212), walls: [2, 2, 2, 7] }, // closet, 6" out
      { polygon: rectLocal(51, 217, 200, 353), walls: [5, 5, 5, 7] }, // utility, 5" in
    ];
    const lefts = alignWalls(rooms).map((r) => Math.min(...r.polygon.map((p) => p.x)));
    expect(lefts).toEqual([46, 46, 46]);
  });

  it("leaves real steps alone and keeps a corner where the wall thickness changes", () => {
    const step = [{ polygon: rectLocal(0, 0, 100, 100), walls: [5, 5, 5, 5] }, { polygon: rectLocal(0, 100, 130, 200), walls: [5, 5, 5, 5] }];
    expect(Math.max(...alignWalls(step)[1].polygon.map((p) => p.x))).toBe(130); // 30" step stays
    const out = simplifyOutline([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }], [7, 2, 5, 5, 5]);
    expect(out.polygon).toHaveLength(5); // 7" and 2" walls meet at (0,50): corner kept
  });
});

describe("snapping doors into walls", () => {
  const rooms = [{ polygon: rectLocal(0, 0, 100, 100), walls: [5, 5, 5, 5] }];
  it("turns, centres and sizes a door dropped near a wall, swinging into the room", () => {
    // Dropped 6" inside the right wall, not turned.
    const out = snapOpeningToWall({ shape: "door" as const, x: 94, y: 50, width: 30, depth: 2, rotation: 0 }, rooms);
    expect(out).toMatchObject({ x: 102.5, y: 50, depth: 5, rotation: 90 }); // front faces −x: into the room
  });
  it("keeps a door's swing when it's already along the wall, and stays inside the wall's length", () => {
    const out = snapOpeningToWall({ shape: "opening" as const, x: 95, y: -2, width: 36, depth: 4, rotation: 180 }, rooms);
    expect(out).toMatchObject({ x: 82, y: -2.5, depth: 5, rotation: 180 });
  });
  it("leaves things alone away from walls", () => {
    const door = { shape: "door" as const, x: 50, y: 50, width: 30, depth: 2, rotation: 0 };
    expect(snapOpeningToWall(door, rooms)).toEqual(door);
  });
});
