import { describe, expect, it } from "vitest";
import { emptyStyle, type Plan } from "../../shared/schemas";
import { rectLocal } from "../model/geometry";
import { keepRoomResult, redo, undo, usePlan } from "./planStore";

const plan = (): Plan => ({
  id: "p", name: "P", createdAt: "", updatedAt: "", image: null, pxPerInch: 2, wallThickness: 5, style: emptyStyle(),
  rooms: [{ id: "office", name: "Office", type: "office", polygon: rectLocal(0, 0, 120, 120) }],
  items: [],
});

describe("Claude's answers and Undo", () => {
  it("keeps a room's chat through Undo and Redo, and saving it adds no Undo step", () => {
    usePlan.getState().setPlan(plan());
    usePlan.getState().updateRoom("office", { name: "Study" });
    const steps = usePlan.temporal.getState().pastStates.length;
    keepRoomResult("office", { chat: [{ role: "user", text: "Where should the desk go?", changed: [], at: "" }] });
    expect(usePlan.temporal.getState().pastStates.length).toBe(steps);

    undo();
    const room = () => usePlan.getState().plan!.rooms[0];
    expect(room().name).toBe("Office"); // the edit is undone
    expect(room().chat).toHaveLength(1); // the chat stays
    redo();
    expect(room().name).toBe("Study");
    expect(room().chat).toHaveLength(1);
  });
});
