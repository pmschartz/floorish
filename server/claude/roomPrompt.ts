import type { RoomContext } from "../../shared/schemas";
import { CATALOG } from "../../src/catalog/furniture";

/** Shared instructions for laying out a room (redesign and chat). */
export const ROOM_DESIGN_RULES = `Coordinates
- Inches in the room's own frame: origin at the top-left of the room's bounding box, x to the right, y down.
- x, y is the CENTER of each piece. width runs side to side as you face the piece's front; depth runs front to back.
- rotation is which way the piece's FRONT faces: 0 = toward the bottom wall, 90 = toward the left wall, 180 = toward the top wall, 270 = toward the right wall. At 90 or 270 the piece's width runs up and down.
- Fronts: a desk's or table's front is the side you sit at, so its rotation points from the desk toward its chair; a bed's is its foot; a sofa's or chair's is the seat; a dresser's, bookcase's or TV stand's is the side you use. Pieces against a wall face away from it (a desk against the top wall has rotation 0).
- category: the catalog piece's category (desk, office chair, bookcase, rug, armchair…) or one specific word such as lamp or plant. Never a group name like seating, storage or lighting.
- Every piece must sit fully inside the room outline and clear of fixtures, other pieces (a chair may tuck under its desk or table), and door swings. A rug may go under furniture.

Good practice (apply unless the brief says otherwise)
- Walkways at least 30–36" wide; keep a clear path from each door into the room.
- Leave 36" behind a desk chair, 24" beside a bed, 36" in front of dressers and wardrobes.
- Don't block windows with tall pieces; don't put furniture in a door's swing.
- Desks: a window to the side gives the best light (not behind you, causing glare on screens, nor straight ahead).
- Rugs sized so at least the front legs of seating sit on them.
- Scale pieces to the room; leave some open floor.`;

export const FENG_SHUI_RULES = `Feng shui
- Command position: put the main piece (desk, bed) where you can see the door without being directly in line with it, ideally diagonal to it, with a solid wall behind you. Never with your back to the door.
- Don't sit or sleep with a window directly behind your head; a solid wall is better support.
- Keep the path from the door open and uncluttered so energy (and people) flow; avoid sharp corners pointing at where you sit.
- Balance: pair pieces where it makes sense (lamps, side tables), mix tall and low, soft and hard.
- Bring in living things and light: a plant, a lamp in a dark corner.`;

/** The furniture catalog Claude can draw from (key, name, default size). */
export function catalogText(): string {
  return CATALOG.filter((c) => c.category !== "door" && c.category !== "window")
    .map((c) => `${c.key}: ${c.label}, ${c.width}" W × ${c.depth}" D (${c.shape})`)
    .join("\n");
}

/** The room and its surroundings, in words and numbers. */
export function describeRoom(c: RoomContext): string {
  const pt = (p: { x: number; y: number }) => `(${p.x}, ${p.y})`;
  const lines = [
    `Room: ${c.room.name} (${c.room.type}), ${c.room.widthIn}" wide × ${c.room.depthIn}" deep.`,
    `Outline (clockwise): ${c.room.outline.map(pt).join(" → ")}`,
    `Edges: ${c.room.edges.map((e) => `${e.side} ${pt(e.from)}→${pt(e.to)}${e.wall ? "" : " (open to the next space, no wall)"}`).join("; ")}`,
    c.openings.length
      ? `Doors, windows and openings:\n${c.openings.map((o) => `- ${o.label || o.kind} on the ${o.side} wall at ${pt(o)}, ${o.width}" wide${o.kind === "door" ? (o.swingsInto === "room" ? ", swings INTO this room" : ", swings away from this room") : ""}`).join("\n")}`
      : "No doors or windows recorded.",
    c.fixtures.length
      ? `Built-in fixtures (can't move):\n${c.fixtures.map((f) => `- ${f.label} at ${pt(f)}, ${f.width}" × ${f.depth}", rotation ${f.rotation}`).join("\n")}`
      : "",
    c.furniture.length
      ? `Furniture there now:\n${c.furniture.map((f) => `- [${f.id}] ${f.label} (${f.category}) at ${pt(f)}, ${f.width}" W × ${f.depth}" D, rotation ${f.rotation}, ${f.status}`).join("\n")}`
      : "The room is empty.",
    c.neighbors.length ? `Next to: ${c.neighbors.map((n) => `${n.name} (${n.type}) on the ${n.side}`).join(", ")}` : "",
    `Whole house: ${c.house.map((h) => `${h.name} (${h.type}, ${h.areaSqFt} sq ft)`).join(", ")}`,
    c.style.styles.length ? `Style: ${c.style.styles.join(", ")}` : "Style: not chosen",
    c.style.palette.length ? `Palette (hex): ${c.style.palette.join(", ")}` : "",
    c.style.avoid ? `Avoid: ${c.style.avoid}` : "",
    c.style.budgetNote ? `Budget: ${c.style.budgetNote}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

