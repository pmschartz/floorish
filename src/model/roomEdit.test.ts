import { describe, expect, it } from "vitest";
import { emptyStyle, type Plan } from "../../shared/schemas";
import { rectLocal } from "./geometry";
import { mergeCandidates, mergeRooms, moveRoomEdge, unionOutline } from "./roomEdit";

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
