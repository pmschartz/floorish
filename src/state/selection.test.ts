import { describe, expect, it } from "vitest";
import { emptyStyle, type Item, type Plan } from "../../shared/schemas";
import { usePlan } from "./planStore";

const piece = (id: string, x: number): Item => ({
  id, catalogKey: "custom", label: id, category: "chair", shape: "rect", x, y: 50, width: 20, depth: 20,
  height: null, rotation: 0, flip: false, color: "", status: "existing", notes: "", shopResults: null,
});
const plan = (): Plan => ({
  id: "p", name: "P", createdAt: "", updatedAt: "", image: null, pxPerInch: 2, wallThickness: 5, style: emptyStyle(),
  rooms: [], items: [piece("a", 20), piece("b", 60), piece("c", 100)],
});
const st = () => usePlan.getState();

describe("selecting several pieces", () => {
  it("shift-click adds and removes; a plain click selects just one", () => {
    st().setPlan(plan());
    st().pickItem("a", false);
    st().pickItem("b", true);
    expect(st().selectedItemIds).toEqual(["a", "b"]);
    st().pickItem("a", true);
    expect(st().selectedItemIds).toEqual(["b"]);
    expect(st().selectedItemId).toBe("b");
    st().pickItem("c", false);
    expect(st().selectedItemIds).toEqual(["c"]);
  });

  it("grabbing one of a group keeps the group, so they can be dragged together", () => {
    st().setPlan(plan());
    st().selectItems(["a", "b", "c"], false);
    st().pickItem("b", false);
    expect(st().selectedItemIds).toEqual(["a", "b", "c"]);
    expect(st().selectedItemId).toBe("b");
  });

  it("moves a group in one undoable step, and deleting drops them from the selection", () => {
    st().setPlan(plan());
    st().selectItems(["a", "c"], false);
    const before = usePlan.temporal.getState().pastStates.length;
    st().moveItems(["a", "c"], 10, 5);
    expect(usePlan.temporal.getState().pastStates.length).toBe(before + 1);
    const xs = Object.fromEntries(st().plan!.items.map((i) => [i.id, [i.x, i.y]]));
    expect(xs).toEqual({ a: [30, 55], b: [60, 50], c: [110, 55] });

    st().removeItems(["a", "c"]);
    expect(st().plan!.items.map((i) => i.id)).toEqual(["b"]);
    expect(st().selectedItemIds).toEqual([]);
  });

  it("keeps the list in step when code selects a single piece or a room", () => {
    st().setPlan(plan());
    st().selectItems(["a", "b"], false);
    st().select({ item: "c" });
    expect(st().selectedItemIds).toEqual(["c"]);
    st().select({ room: "r1" });
    expect(st().selectedItemIds).toEqual([]);
  });
});
