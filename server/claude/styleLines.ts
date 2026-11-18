import type { StyleProfile } from "../../shared/schemas";
import { describeEntry } from "../../shared/sw";

/**
 * Prompt lines for the owner's taste: what this room is for and its own styles (when set), then
 * the house style, palette, things to avoid and budget.
 */
export function styleLines(house: StyleProfile, room: { about?: string; styles?: string[] } = {}): string[] {
  const about = room.about?.trim();
  const own = room.styles?.filter(Boolean) ?? [];
  return [
    about ? `What this room is for, in the owner's words: ${about}. Let this lead your choices for this room.` : "",
    own.length
      ? `Style for this room: ${own.join(", ")}${house.styles.length ? ` (the rest of the house is ${house.styles.join(", ")})` : ""}`
      : house.styles.length ? `Style: ${house.styles.join(", ")}` : "Style: not chosen",
    house.palette.length ? `House palette (Sherwin-Williams paint colors; refer to them by SW number and name, not hex): ${house.palette.map((p) => describeEntry(p)).join("; ")}` : "",
    house.avoid ? `Avoid: ${house.avoid}` : "",
    house.budgetNote ? `Budget: ${house.budgetNote}` : "",
  ].filter(Boolean);
}
