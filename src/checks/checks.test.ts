import { describe, expect, it } from "vitest";
import type { Item, Room } from "../../shared/schemas";
import { itemCorners, polygonInside, rectLocal } from "../model/geometry";
import { runLayoutChecks } from "./layoutChecks";
import { findOpenSpot } from "./placement";

let n = 0;
function item(p: Partial<Item> & Pick<Item, "category" | "x" | "y" | "width" | "depth">): Item {
  return {
    id: `i${++n}`,
    catalogKey: "custom",
    label: p.category,
    shape: "rect",
    height: null,
    rotation: 0,
    color: "",
    status: "existing",
    notes: "",
    shopResults: null,
    ...p,
  };
}

// 12' × 12' bedroom
const room: Room = { id: "r1", name: "Bedroom", type: "bedroom", polygon: rectLocal(0, 0, 144, 144) };

describe("layout checks", () => {
  it("flags overlapping furniture but not rugs", () => {
    const bed = item({ category: "bed", catalogKey: "bed-queen", x: 72, y: 50, width: 60, depth: 80 });
    const desk = item({ category: "desk", x: 72, y: 50, width: 40, depth: 20 });
    const rug = item({ category: "rug", x: 72, y: 72, width: 96, depth: 120 });
    const issues = runLayoutChecks([bed, desk, rug], [room]);
    const overlaps = issues.filter((i) => i.kind === "overlap");
    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].itemIds.sort()).toEqual([bed.id, desk.id].sort());
  });

  it("lets a chair tuck under a desk", () => {
    const desk = item({ category: "desk", x: 72, y: 20, width: 60, depth: 30 });
    const chair = item({ category: "office chair", shape: "circle", x: 72, y: 34, width: 26, depth: 26 });
    expect(runLayoutChecks([desk, chair], [room]).filter((i) => i.kind === "overlap")).toHaveLength(0);
  });

  it("flags a bed pushed against a wall on one side, with how much room is left", () => {
    // Queen bed with its left side 10" from the left wall; headboard against the top wall.
    const bed = item({ category: "bed", catalogKey: "bed-queen", x: 40, y: 40, width: 60, depth: 80 });
    const issues = runLayoutChecks([bed], [room]);
    const left = issues.find((i) => i.id === `clearance:${bed.id}:left`);
    expect(left).toBeDefined();
    expect(left!.message).toMatch(/only about 10"/);
    expect(issues.find((i) => i.id === `clearance:${bed.id}:right`)).toBeUndefined();
  });

  it("allows nightstands beside the bed but flags a dresser there", () => {
    const bed = item({ category: "bed", catalogKey: "bed-queen", x: 72, y: 40, width: 60, depth: 80 });
    const ns = item({ category: "nightstand", x: 30, y: 8, width: 24, depth: 16 });
    const dresser = item({ category: "dresser", x: 112, y: 40, width: 18, depth: 40 });
    const issues = runLayoutChecks([bed, ns, dresser], [room]);
    expect(issues.find((i) => i.id === `clearance:${bed.id}:left`)).toBeUndefined();
    const right = issues.find((i) => i.id === `clearance:${bed.id}:right`);
    expect(right?.message).toContain("dresser");
  });

  it("flags items through walls", () => {
    const shelf = item({ category: "bookcase", x: 140, y: 72, width: 36, depth: 12, rotation: 90 });
    const issues = runLayoutChecks([shelf], [room]);
    expect(issues.some((i) => i.kind === "outside-room")).toBe(true);
  });

  it("flags furniture in a door swing", () => {
    const door = item({ category: "door", shape: "door", x: 20, y: 1, width: 30, depth: 2 });
    const chair = item({ category: "armchair", x: 20, y: 20, width: 20, depth: 20 });
    const issues = runLayoutChecks([door, chair], [room]);
    expect(issues.some((i) => i.kind === "door-swing" && i.itemIds.includes(chair.id))).toBe(true);
  });
});

describe("findOpenSpot", () => {
  it("finds a spot inside the room that avoids existing furniture", () => {
    const bed = item({ category: "bed", catalogKey: "bed-queen", x: 72, y: 40, width: 60, depth: 80 });
    const spot = findOpenSpot(room, [bed], 24, 16)!;
    expect(spot).not.toBeNull();
    const c = itemCorners({ ...spot, width: 24, depth: 16 });
    expect(polygonInside(c, room.polygon)).toBe(true);
    const issues = runLayoutChecks([bed, item({ category: "nightstand", ...spot, width: 24, depth: 16 })], [room]);
    expect(issues.filter((i) => i.kind === "overlap")).toHaveLength(0);
  });

  it("returns null when nothing fits", () => {
    expect(findOpenSpot(room, [], 200, 200)).toBeNull();
  });
});
