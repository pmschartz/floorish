import { describe, expect, it } from "vitest";
import { emptyStyle, type Plan } from "../../shared/schemas";
import { rectLocal } from "./geometry";
import { addRoomCarving, mergeCandidates, mergeRooms, moveRoomEdge, removeRoomGivingSpace, resolveOverlaps, setEdgeWall, unionOutline } from "./roomEdit";
import { polygonArea } from "./geometry";
import { wallStandard } from "../detect/walls";

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

describe("rooms make space for each other", () => {
  const bedroom = () => ({ id: "bed", name: "Bedroom", type: "bedroom" as const, polygon: rectLocal(0, 0, 150, 120), walls: [7, 7, 7, 7] });
  const closet = { id: "closet", name: "Closet", type: "closet" as const, polygon: rectLocal(0, 0, 60, 30) };
  const big = { id: "big", name: "Big", type: "other" as const, polygon: rectLocal(0, 125, 150, 200), walls: [5, 7, 7, 7] };

  it("cuts a closet drawn in a bedroom's corner out of the bedroom, with a wall between", () => {
    const before = plan([bedroom()]);
    const t = wallStandard(before.rooms).interior;
    const p = addRoomCarving(before, closet);
    const bed = p.rooms.find((r) => r.id === "bed")!;
    expect(bed.polygon).toHaveLength(6);
    expect(bed.polygon).toContainEqual({ x: 60 + t, y: 0 }); // closet's right side + an inside wall
    expect(bed.polygon).toContainEqual({ x: 0, y: 30 + t }); // closet's bottom + an inside wall
    expect(polygonArea(bed.polygon)).toBeCloseTo(150 * 120 - (60 + t) * (30 + t));
    expect(p.rooms.find((r) => r.id === "closet")!.polygon).toEqual(closet.polygon);
  });

  it("leaves rooms it doesn't overlap alone", () => {
    const p = addRoomCarving(plan([bedroom()]), { ...closet, polygon: rectLocal(300, 0, 360, 30) });
    expect(p.rooms[0].polygon).toEqual(rectLocal(0, 0, 150, 120));
  });

  it("gives a deleted closet's space back to the bedroom", () => {
    const p = addRoomCarving(plan([bedroom()]), closet);
    const back = removeRoomGivingSpace(p, "closet");
    expect(back.rooms.map((r) => r.id)).toEqual(["bed"]);
    expect(back.rooms[0].polygon).toHaveLength(4);
    expect(polygonArea(back.rooms[0].polygon)).toBeCloseTo(150 * 120);
    expect(removeRoomGivingSpace(p, "closet", false).rooms[0].polygon).toHaveLength(6);
  });

  it("tidies a plan whose rooms were drawn on top of each other", () => {
    const p = resolveOverlaps(plan([bedroom(), closet]));
    expect(p.rooms[0].polygon).toHaveLength(6);
    expect(resolveOverlaps(p)).toBe(p); // nothing left to do
  });

  it("moves the next room's wall along when a shared wall is dragged", () => {
    const p = plan([bedroom(), big]);
    const bottom = p.rooms[0].polygon.findIndex((pt, i, a) => pt.y === 120 && a[(i + 1) % 4].y === 120);
    const out = moveRoomEdge(p, "bed", bottom, 100);
    expect(Math.min(...out.rooms[1].polygon.map((q) => q.y))).toBeCloseTo(105); // followed, 5" wall kept
    const pushed = moveRoomEdge(p, "bed", bottom, 160);
    expect(Math.min(...pushed.rooms[1].polygon.map((q) => q.y))).toBeCloseTo(165);
  });
});
