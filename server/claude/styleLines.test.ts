import { describe, expect, it } from "vitest";
import { emptyStyle } from "../../shared/schemas";
import { styleLines } from "./styleLines";

describe("style in prompts", () => {
  const house = { ...emptyStyle(), styles: ["Scandinavian"], avoid: "glass tables" };

  it("uses the house style when the room has none of its own", () => {
    const lines = styleLines(house);
    expect(lines).toContain("Style: Scandinavian");
    expect(lines).toContain("Avoid: glass tables");
  });

  it("leads with what the room is for, and its own style over the house's", () => {
    const lines = styleLines(house, { about: "Game and movie room", styles: ["Industrial"] });
    expect(lines[0]).toMatch(/Game and movie room/);
    expect(lines).toContain("Style for this room: Industrial (the rest of the house is Scandinavian)");
    expect(lines.some((l) => l.startsWith("Style: "))).toBe(false);
  });
});
