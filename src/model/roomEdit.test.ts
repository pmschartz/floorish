import { describe, expect, it } from "vitest";
import { emptyStyle, type Plan } from "../../shared/schemas";
import { rectLocal } from "./geometry";
import { mergeCandidates, mergeRooms, moveRoomEdge, setEdgeWall, unionOutline } from "./roomEdit";

const plan = (rooms: Plan["rooms"]): Plan => ({
  id: "p", name: "P", createdAt: "", updatedAt: "", image: null, pxPerInch: 2, wallThickness: 5, style: emptyStyle(), rooms, items: [],
});

describe("merging rooms", () => {
  it("joins two touching rooms into one rectangle", () => {
    expect(unionOutline(rectLocal(0, 0, 100, 60), rectLocal(0, 60, 100, 120))).toEqual(rectLocal(0, 0, 100, 120));
  });

  it("takes in the wall between rooms, and makes an L where they differ in size", () => {
    const out = unionOutline(rectLocal(0, 0, 100, 60), rectLocal(0, 65, 60, 120))!;
    expect(out).toHaveLength(6);
    expect(out).toContainEqual({ x: 0, y: 120 });
    expect(out).toContainEqual({ x: 100, y: 60 });
  });

  it("won't merge rooms that don't connect", () => {
    expect(unionOutline(rectLocal(0, 0, 50, 50), rectLocal(200, 0, 250, 50))).toBeNull();
  });

  it("keeps the first room's name and removes the other", () => {
    const p = plan([
      { id: "bed", name: "Bedroom", type: "bedroom", polygon: rectLocal(0, 0, 150, 120), walls: [7, 7, 2, 7] },
      { id: "closet", name: "Closet", type: "closet", polygon: rectLocal(0, 120, 150, 160), walls: [2, 7, 7, 7] },
      { id: "far", name: "Far", type: "other", polygon: rectLocal(400, 0, 500, 100) },
    ]);
    expect(mergeCandidates(p, "bed").map((r) => r.id)).toEqual(["closet"]);
    const m = mergeRooms(p, "bed", "closet")!;
    expect(m.rooms.map((r) => r.name)).toEqual(["Bedroom", "Far"]);
    expect(m.rooms[0].polygon).toEqual(rectLocal(0, 0, 150, 160));
    expect(m.rooms[0].walls).toHaveLength(4);
  });
});

describe("moving a wall", () => {
  it("moves both ends of the wall and leaves the rest of the room", () => {
    const p = plan([{ id: "r", name: "R", type: "other", polygon: rectLocal(0, 0, 100, 100), walls: [5, 5, 5, 5] }]);
    const right = p.rooms[0].polygon.findIndex((pt, i, a) => pt.x === 100 && a[(i + 1) % 4].x === 100);
    const moved = moveRoomEdge(p, "r", right, 120);
    expect(moved.rooms[0].polygon.filter((pt) => pt.x === 120)).toHaveLength(2);
    expect(moved.rooms[0].polygon.filter((pt) => pt.x === 0)).toHaveLength(2);
  });
});

describe("standard walls", () => {
  it("makes every wall between rooms the same thickness, and outside walls the outside thickness", async () => {
    const { standardizeWalls } = await import("../detect/walls");
    const rooms = [
      { polygon: rectLocal(0, 0, 100, 100), walls: [7, 7, 7, 7] },
      { polygon: rectLocal(103, 0, 200, 100), walls: [7, 7, 7, 3] }, // 3" gap to the left room
      { polygon: rectLocal(0, 106, 100, 200), walls: [6, 7, 7, 7] }, // 6" gap above
    ];
    const { rooms: out, standard } = standardizeWalls(rooms, { interior: 4.5, exterior: 7 });
    expect(standard).toEqual({ interior: 4.5, exterior: 7 });
    const right = (r: typeof out[number]) => Math.max(...r.polygon.map((p) => p.x));
    const left = (r: typeof out[number]) => Math.min(...r.polygon.map((p) => p.x));
    expect(left(out[1]) - right(out[0])).toBeCloseTo(4.5); // gap is now one standard wall
    const top = (r: typeof out[number]) => Math.min(...r.polygon.map((p) => p.y));
    const bottom = (r: typeof out[number]) => Math.max(...r.polygon.map((p) => p.y));
    expect(top(out[2]) - bottom(out[0])).toBeCloseTo(4.5);
    expect(out.flatMap((r) => r.walls).every((t) => t === 4.5 || t === 7)).toBe(true);
  });
});

describe("wall or open", () => {
  it("puts a wall between two touching rooms by moving them apart, and takes it away again", () => {
    const p = plan([
      { id: "stairs", name: "Stairs", type: "other", polygon: rectLocal(0, 0, 100, 100), walls: [7, null, 7, 7] },
      { id: "bed", name: "Bedroom", type: "bedroom", polygon: rectLocal(100, 0, 250, 100), walls: [7, 7, 7, null] },
    ]);
    const edge = p.rooms[0].polygon.findIndex((pt, i, a) => pt.x === 100 && a[(i + 1) % 4].x === 100);
    const walled = setEdgeWall(p, "stairs", edge, true);
    const gap = Math.min(...walled.rooms[1].polygon.map((q) => q.x)) - Math.max(...walled.rooms[0].polygon.map((q) => q.x));
    expect(gap).toBeGreaterThanOrEqual(3.5);
    expect(walled.rooms[0].walls).not.toContain(null);
    const opened = setEdgeWall(walled, "stairs", edge, false);
    expect(opened.rooms[0].walls).toContain(null);
    expect(Math.max(...opened.rooms[0].polygon.map((q) => q.x))).toBeCloseTo(Math.min(...opened.rooms[1].polygon.map((q) => q.x)));
  });
});
