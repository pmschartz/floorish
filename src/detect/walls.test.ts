import { describe, expect, it } from "vitest";
import type { Item } from "../../shared/schemas";
import { rectLocal } from "../model/geometry";
import { defaultOpts, findWallBand, type Mask } from "./snap";
import { connectWalls, fitOpeningsToWalls } from "./walls";

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
