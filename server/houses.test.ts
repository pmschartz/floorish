import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let store: typeof import("./storage");

beforeAll(async () => {
  // Each test file gets its own module registry, so this data dir is ours alone.
  process.env.HOUSE_PLANNER_DATA = mkdtempSync(path.join(tmpdir(), "hp-houses-"));
  store = await import("./storage");
  await store.ensureDirs();
});

describe("houses", () => {
  it("names a house from its floors' plan names", () => {
    expect(store.commonName(["Oak Crest Upstairs", "Oak Crest Basement"])).toBe("Oak Crest");
    expect(store.floorName("Oak Crest Upstairs", "Oak Crest")).toBe("Upstairs");
    expect(store.floorName("Garage", "Oak Crest")).toBe("Garage");
  });

  it("combines plans into a house that shares the style that was set", async () => {
    const up = await store.createPlan("Oak Crest Upstairs");
    await store.writePlan({ ...up, style: { styles: ["Mid-century modern"], palette: ["SW 7008"], avoid: "", budgetNote: "" } });
    const down = await store.createPlan("Oak Crest Basement");

    const house = await store.addFloors([up.id, down.id]);
    expect(house.name).toBe("Oak Crest");
    expect(house.floors).toEqual([up.id, down.id]);
    expect(house.style.styles).toEqual(["Mid-century modern"]);

    const downNow = await store.readPlan(down.id);
    expect(downNow.name).toBe("Basement");
    expect(downNow.houseId).toBe(house.id);
    expect(downNow.style.styles).toEqual(["Mid-century modern"]);

    const view = await store.houseView(house.id);
    expect(view.floorPlans.map((f) => f.name)).toEqual(["Upstairs", "Basement"]);
  });

  it("saves a style change to every floor, and drops a deleted floor from its house", async () => {
    const a = await store.createPlan("Lake House Main");
    const b = await store.createPlan("Lake House Loft");
    const house = await store.addFloors([a.id, b.id]);
    await store.updateHouse(house.id, { style: { styles: ["Coastal"], palette: [], avoid: "", budgetNote: "" } });
    expect((await store.readPlan(b.id)).style.styles).toEqual(["Coastal"]);

    await store.deletePlan(b.id);
    expect((await store.readHouse(house.id)).floors).toEqual([a.id]);
    await store.deletePlan(a.id);
    await expect(store.readHouse(house.id)).rejects.toThrow();
  });
});

describe("reordering and removing floors", () => {
  it("reorders floors, and takes one out as a plan of its own", async () => {
    const a = await store.createPlan("Pine Lodge Main");
    const b = await store.createPlan("Pine Lodge Loft");
    const house = await store.addFloors([a.id, b.id]);
    expect((await store.updateHouse(house.id, { floors: [b.id, a.id] })).floors).toEqual([b.id, a.id]);

    const left = await store.removeFloor(house.id, b.id);
    expect(left?.floors).toEqual([a.id]);
    const loft = await store.readPlan(b.id);
    expect(loft.houseId).toBeNull();
    expect(loft.name).toBe("Pine Lodge Loft");

    expect(await store.removeFloor(house.id, a.id)).toBeNull();
    await expect(store.readHouse(house.id)).rejects.toThrow();
  });
});

describe("other floors in room prompts", () => {
  it("names this floor and lists the rooms on the others", async () => {
    const { describeRoom } = await import("./claude/roomPrompt");
    const { buildRoomContext } = await import("../src/model/roomContext");
    const { rectLocal } = await import("../src/model/geometry");
    const { emptyStyle } = await import("../shared/schemas");
    const plan = {
      id: "p", name: "Basement", houseId: "h", createdAt: "", updatedAt: "", image: null, pxPerInch: 2, wallThickness: 5, style: emptyStyle(),
      rooms: [{ id: "fam", name: "Future Family", type: "living" as const, polygon: rectLocal(0, 0, 200, 150) }], items: [],
    };
    const text = describeRoom(buildRoomContext(plan, plan.rooms[0], [{ name: "Upstairs", rooms: [{ name: "Kitchen", type: "kitchen", areaSqFt: 212, paint: "" }] }]));
    expect(text).toMatch(/This floor \(Basement\): Future Family/);
    expect(text).toMatch(/Other floor \(Upstairs\): Kitchen \(kitchen, 212 sq ft\)/);
  });
});
