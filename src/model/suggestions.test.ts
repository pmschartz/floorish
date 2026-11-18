import { describe, expect, it } from "vitest";
import { RoomSchema } from "../../shared/schemas";
import { rectLocal } from "./geometry";

describe("saved What's missing answers", () => {
  it("survive a save and reload with the room", () => {
    const saved = {
      askedAt: "2026-11-17T12:00:00.000Z",
      basis: "abc123",
      response: {
        summary: "Needs a reading light.",
        suggestions: [{ category: "lamp", label: "Floor lamp", widthIn: 12, depthIn: 12, reason: "Light by the chair.", placementHint: "Right of the armchair", priority: "recommended" as const }],
      },
      added: [0],
    };
    const room = { id: "r", name: "Office", type: "office" as const, polygon: rectLocal(0, 0, 100, 100), suggestions: saved };
    expect(RoomSchema.parse(JSON.parse(JSON.stringify(room))).suggestions).toEqual(saved);
  });

  it("default to nothing added for answers saved without the field", () => {
    const room = RoomSchema.parse({
      id: "r", name: "Office", type: "office", polygon: rectLocal(0, 0, 100, 100),
      suggestions: { askedAt: "x", basis: "y", response: { summary: "", suggestions: [] } },
    });
    expect(room.suggestions!.added).toEqual([]);
  });
});
