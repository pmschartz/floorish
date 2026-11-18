import { describe, expect, it } from "vitest";
import { RoomSchema, type Room } from "../../shared/schemas";
import { describePaint, findSw } from "../../shared/sw";
import { rectLocal } from "./geometry";
import { edgeSides, paintSegments } from "./paint";

const room = (paint?: Room["paint"], walls?: Room["walls"]): Room => ({
  id: "r", name: "Office", type: "office", polygon: rectLocal(0, 0, 120, 100), walls, paint,
});
const paint = (p: Partial<NonNullable<Room["paint"]>>) => ({ walls: null, accent: null, accentSide: null, trim: null, ceiling: null, ...p });

describe("room paint", () => {
  it("knows which side of the plan each wall faces", () => {
    expect([...edgeSides(room())].sort()).toEqual(["bottom", "left", "right", "top"]);
  });

  it("paints every wall inside the room, with the accent wall in its own color", () => {
    const segs = paintSegments(room(paint({ walls: "SW 7008", accent: "SW 6244", accentSide: "left" })), 4);
    expect(segs).toHaveLength(4);
    const alabaster = findSw("SW 7008")!.hex, naval = findSw("SW 6244")!.hex;
    expect(segs.filter((s) => s.color === naval)).toHaveLength(1);
    expect(segs.filter((s) => s.color === alabaster)).toHaveLength(3);
    // Strips sit just inside the outline, 2" in (half the band).
    for (const s of segs) {
      const [x1, y1, x2, y2] = s.pts;
      for (const [x, y] of [[x1, y1], [x2, y2]]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(120);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(100);
      }
    }
    const left = segs.find((s) => s.color === naval)!;
    expect(left.pts[0]).toBe(2);
  });

  it("leaves open edges and unpainted rooms alone", () => {
    expect(paintSegments(room(), 4)).toEqual([]);
    expect(paintSegments(room(paint({ walls: "SW 7008" }), [5, null, 5, 5]), 4)).toHaveLength(3);
  });

  it("stores colors as SW references, converting hex from older saves", () => {
    const r = RoomSchema.parse({ ...room(), paint: { walls: "#edeae0", trim: "Pure White" } });
    expect(r.paint).toEqual({ walls: "SW 7008", accent: null, accentSide: null, trim: "SW 7005", ceiling: null });
  });

  it("describes a room's paint in words", () => {
    expect(describePaint(paint({ walls: "SW 7008", accent: "SW 6244", accentSide: "left" }), false))
      .toBe("walls SW 7008 Alabaster; accent wall (left wall on the plan) SW 6244 Naval");
    expect(describePaint(undefined)).toBe("");
  });
});
