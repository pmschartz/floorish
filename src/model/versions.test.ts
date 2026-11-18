import { describe, expect, it } from "vitest";
import { emptyStyle, type Item, type Plan } from "../../shared/schemas";
import { rectLocal } from "./geometry";
import { addVersion, deleteVersion, duplicateVersion, ensureVersions, roomFurniture, switchVersion, versionItems } from "./versions";

let n = 0;
const item = (p: Partial<Item> & Pick<Item, "x" | "y">): Item => ({
  id: `i${++n}`, catalogKey: "custom", label: "Desk", category: "desk", shape: "rect", width: 40, depth: 20, height: null,
  rotation: 0, flip: false, color: "", status: "existing", notes: "", shopResults: null, ...p,
});

function plan(): Plan {
  return {
    id: "p", name: "P", createdAt: "", updatedAt: "", image: null, pxPerInch: 2, wallThickness: 5, style: emptyStyle(),
    rooms: [
      { id: "office", name: "Office", type: "office", polygon: rectLocal(0, 0, 120, 120) },
      { id: "bed", name: "Bedroom", type: "bedroom", polygon: rectLocal(130, 0, 300, 120) },
    ],
    items: [
      item({ id: "desk", x: 60, y: 30 }),
      item({ id: "chair", x: 60, y: 60, label: "Chair", category: "office chair" }),
      item({ id: "door", x: 60, y: 1, shape: "door", category: "door" }),
      item({ id: "bedframe", x: 200, y: 60, label: "Bed", category: "bed" }),
    ],
  };
}

describe("room versions", () => {
  it("knows which furniture is in a room, leaving doors and other rooms alone", () => {
    expect(roomFurniture(plan().items, plan().rooms[0]).map((i) => i.id)).toEqual(["desk", "chair"]);
  });

  it("starts with a Current version holding today's furniture", () => {
    const p = ensureVersions(plan(), "office");
    const room = p.rooms[0];
    expect(room.versions!.map((v) => v.name)).toEqual(["Current"]);
    expect(room.activeVersionId).toBe(room.versions![0].id);
    expect(versionItems(p, room, room.versions![0]).map((i) => i.id)).toEqual(["desk", "chair"]);
  });

  it("switches furniture in and out, and back again", () => {
    const { plan: p1, id } = addVersion(plan(), "office", {
      name: "Desk on the wall", brief: "", concept: "", items: [item({ x: 100, y: 60, label: "Desk", rotation: 90 })],
    });
    const p2 = switchVersion(p1, "office", id);
    const ids = (p: Plan) => roomFurniture(p.items, p.rooms[0]).map((i) => i.label);
    expect(ids(p2)).toEqual(["Desk"]);
    expect(p2.items.some((i) => i.id === "door")).toBe(true); // the door stays
    expect(p2.items.some((i) => i.id === "bedframe")).toBe(true); // the bedroom is untouched
    const current = p2.rooms[0].versions![0];
    expect(current.items.map((i) => i.id)).toEqual(["desk", "chair"]); // put away safely

    const p3 = switchVersion(p2, "office", current.id);
    expect(roomFurniture(p3.items, p3.rooms[0]).map((i) => i.id)).toEqual(["desk", "chair"]);
    expect(p3.rooms[0].versions!.find((v) => v.id === id)!.items).toHaveLength(1);
  });

  it("duplicates with fresh ids and won't delete the active version", () => {
    const p = ensureVersions(plan(), "office");
    const active = p.rooms[0].activeVersionId!;
    const { plan: p2, id } = duplicateVersion(p, "office", active);
    const copy = p2.rooms[0].versions!.find((v) => v.id === id)!;
    expect(copy.items).toHaveLength(2);
    expect(copy.items.some((i) => i.id === "desk")).toBe(false);
    expect(deleteVersion(p2, "office", active).rooms[0].versions).toHaveLength(2);
    expect(deleteVersion(p2, "office", id).rooms[0].versions).toHaveLength(1);
  });
});
