import { describe, expect, it } from "vitest";
import { emptyStyle, type Item, type Plan } from "../../shared/schemas";
import { itemCorners, polygonInside, rectLocal } from "./geometry";
import { buildRoomContext, placedToItems, repairLayout } from "./roomContext";

let n = 0;
const item = (p: Partial<Item> & Pick<Item, "x" | "y">): Item => ({
  id: `i${++n}`, catalogKey: "custom", label: "Desk", category: "desk", shape: "rect", width: 60, depth: 30, height: null,
  rotation: 0, flip: false, color: "", status: "existing", notes: "", shopResults: null, ...p,
});

// A 10' × 12' office at plan x 100–220, y 50–194; door in the top wall swinging in; bed next door.
function plan(): Plan {
  return {
    id: "p", name: "P", createdAt: "", updatedAt: "", image: null, pxPerInch: 2, wallThickness: 4, style: emptyStyle(),
    rooms: [
      { id: "office", name: "Paige's Office", type: "office", polygon: rectLocal(100, 50, 220, 194) },
      { id: "bed", name: "Bedroom", type: "bedroom", polygon: rectLocal(224, 50, 400, 194) },
    ],
    items: [
      item({ id: "door", x: 130, y: 48, width: 30, depth: 4, shape: "door", category: "door", label: "Door" }),
      item({ id: "desk", x: 160, y: 120 }),
      item({ id: "toilet", x: 300, y: 70, shape: "fixture", category: "toilet", width: 20, depth: 28 }),
    ],
  };
}

describe("buildRoomContext", () => {
  it("describes the room in its own coordinates", () => {
    const c = buildRoomContext(plan(), plan().rooms[0]);
    expect(c.room).toMatchObject({ name: "Paige's Office", widthIn: 120, depthIn: 144 });
    expect(c.room.outline[0]).toEqual({ x: 0, y: 0 });
    expect(c.furniture).toEqual([expect.objectContaining({ id: "desk", x: 60, y: 70 })]);
    expect(c.openings).toEqual([expect.objectContaining({ kind: "door", side: "top", x: 30, swingsInto: "room" })]);
    expect(c.fixtures).toEqual([]); // the toilet is in the bedroom
    expect(c.neighbors).toEqual([{ name: "Bedroom", type: "bedroom", side: "right", paint: "" }]);
  });
});

describe("placedToItems", () => {
  it("converts back to plan coordinates and keeps the real size of reused pieces", () => {
    const p = plan();
    const items = placedToItems(p, p.rooms[0], [
      { catalogKey: "desk", label: "Desk", category: "desk", shape: "rect", x: 90, y: 72, width: 48, depth: 24, rotation: 272, keepId: "desk", why: "" },
      { catalogKey: "bookcase", label: "Bookcase", category: "bookcase", shape: "rect", x: 20, y: 130, width: 36, depth: 12, rotation: 0, keepId: null, why: "books" },
    ], () => "new1");
    expect(items[0]).toMatchObject({ id: "desk", x: 190, y: 122, width: 60, depth: 30, rotation: 270 });
    expect(items[1]).toMatchObject({ id: "new1", catalogKey: "bookcase", x: 120, y: 180, status: "planned", notes: "books" });
  });
});

describe("repairLayout", () => {
  it("moves a piece out of the door swing and back inside the walls", () => {
    const p = plan();
    const room = p.rooms[0];
    const inSwing = item({ x: 130, y: 64, width: 36, depth: 12, category: "bookcase", label: "Bookcase" });
    const throughWall = item({ x: 218, y: 150, width: 20, depth: 20, category: "side table", label: "Side table" });
    const { items, moved, unresolved } = repairLayout(p, room, [inSwing, throughWall]);
    expect(moved).toBe(2);
    expect(unresolved).toBe(0);
    for (const it of items) expect(polygonInside(itemCorners(it), room.polygon)).toBe(true);
  });
});

describe("applyChatChanges", () => {
  it("moves, removes and adds pieces, leaving the others where they are", async () => {
    const { applyChatChanges } = await import("./roomContext");
    const p = plan();
    p.items.push(item({ id: "chair", x: 160, y: 150, width: 26, depth: 26, category: "armchair", label: "Armchair" }));
    p.items.push(item({ id: "lamp", x: 205, y: 180, width: 12, depth: 12, category: "lamp", label: "Lamp" }));
    const { items, summary } = applyChatChanges(p, p.rooms[0], [
      { op: "update", id: "desk", item: { catalogKey: "desk", label: "Desk", category: "desk", shape: "rect", x: 90, y: 72, width: 60, depth: 30, rotation: 270, keepId: null, why: "" } },
      { op: "remove", id: "lamp", item: null },
      { op: "add", id: null, item: { catalogKey: "custom", label: "Plant", category: "plant", shape: "circle", x: 10, y: 134, width: 16, depth: 16, rotation: 0, keepId: null, why: "life" } },
    ], () => "plant1");
    expect(items.find((i) => i.id === "desk")).toMatchObject({ x: 190, y: 122, rotation: 270 });
    expect(items.find((i) => i.id === "chair")).toMatchObject({ x: 160, y: 150 }); // untouched
    expect(items.some((i) => i.id === "lamp")).toBe(false);
    expect(items.find((i) => i.id === "plant1")).toMatchObject({ x: 110, y: 184, status: "planned" });
    expect(summary).toEqual(["moved Desk", "removed Lamp", "added Plant"]);
  });
});

describe("orientToChairs", () => {
  it("turns a desk to face its chair, leaving correct ones alone", async () => {
    const { orientToChairs } = await import("./roomContext");
    const backwards = item({ id: "d1", x: 100, y: 100, rotation: 90 }); // front faces left…
    const chair = item({ id: "c1", x: 128, y: 100, width: 26, depth: 26, category: "office chair", label: "Chair" }); // …chair is on the right
    const fine = item({ id: "d2", x: 300, y: 100, rotation: 0 });
    const chair2 = item({ id: "c2", x: 300, y: 125, width: 26, depth: 26, category: "office chair", label: "Chair" });
    const out = orientToChairs([backwards, chair, fine, chair2]);
    expect(out.find((i) => i.id === "d1")!.rotation).toBe(270);
    expect(out.find((i) => i.id === "d2")!.rotation).toBe(0);
  });
});

describe("normalizeCategory", () => {
  it("turns generic groups into specific categories", async () => {
    const { normalizeCategory } = await import("./roomContext");
    expect(normalizeCategory("seating", "Task chair")).toBe("office chair");
    expect(normalizeCategory("seating", "Mid-century lounge chair")).toBe("armchair");
    expect(normalizeCategory("storage", "Teak bookcase")).toBe("bookcase");
    expect(normalizeCategory("storage", "Low file cabinet")).toBe("file cabinet");
    expect(normalizeCategory("lighting", "Arc floor lamp")).toBe("lamp");
    expect(normalizeCategory("plant", "Fiddle-leaf fig in planter")).toBe("plant");
    expect(normalizeCategory("Desk", "Walnut mid-century desk")).toBe("desk");
  });
});
