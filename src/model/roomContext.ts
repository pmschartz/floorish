import type { Item, Plan, PlacedItem, Point, Room, RoomChatResponse, RoomContext } from "../../shared/schemas";
import { catalogEntry } from "../catalog/furniture";
import { bbox, doorSwing, itemCorners, itemParts, partsOverlap, pointInPolygon, polygonArea, polygonInside, toWorld } from "./geometry";
import { roomFurniture } from "./versions";
import { describePaint } from "../../shared/sw";

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Which side of the room's bounding box a point is nearest. */
function sideOf(p: Point, b: ReturnType<typeof bbox>): string {
  const d = { top: Math.abs(p.y - b.minY), bottom: Math.abs(p.y - b.maxY), left: Math.abs(p.x - b.minX), right: Math.abs(p.x - b.maxX) };
  return (Object.entries(d).sort((a, z) => a[1] - z[1])[0][0]);
}

/** Everything Claude needs to furnish one room, in the room's own coordinates. */
export function buildRoomContext(plan: Plan, room: Room): RoomContext {
  const b = bbox(room.polygon);
  const loc = (p: Point) => ({ x: r1(p.x - b.minX), y: r1(p.y - b.minY) });
  const near = (i: Item, pad: number) => i.x >= b.minX - pad && i.x <= b.maxX + pad && i.y >= b.minY - pad && i.y <= b.maxY + pad;
  const local = (i: Item) => ({ label: i.label || i.category, category: i.category, ...loc(i), width: r1(i.width), depth: r1(i.depth), rotation: Math.round(i.rotation) });

  const openings = plan.items
    .filter((i) => (i.shape === "door" || i.shape === "window" || i.shape === "opening") && near(i, plan.wallThickness + 4))
    .filter((i) => {
      // On this room's walls: just inside or within a wall's thickness of the outline.
      const c = { x: i.x, y: i.y };
      return pointInPolygon(c, room.polygon, plan.wallThickness + 2);
    })
    .map((i) => {
      let swingsInto: "room" | "away" | "none" = "none";
      if (i.shape === "door") {
        const front = toWorld(i, { x: 0, y: i.depth / 2 + i.width * 0.4 });
        swingsInto = pointInPolygon(front, room.polygon, 0) ? "room" : "away";
      }
      return { kind: i.shape, label: i.label, side: sideOf(i, b), ...loc(i), width: r1(i.width), swingsInto };
    });

  const edges = room.polygon.map((p, k) => {
    const q = room.polygon[(k + 1) % room.polygon.length];
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    return { side: sideOf(mid, b), from: loc(p), to: loc(q), wall: room.walls ? room.walls[k] != null : true };
  });

  const neighbors = plan.rooms
    .filter((o) => o.id !== room.id)
    .map((o) => ({ o, ob: bbox(o.polygon) }))
    .filter(({ ob }) => ob.minX <= b.maxX + 14 && ob.maxX >= b.minX - 14 && ob.minY <= b.maxY + 14 && ob.maxY >= b.minY - 14)
    .map(({ o, ob }) => {
      const side = ob.minX >= b.maxX - 14 ? "right" : ob.maxX <= b.minX + 14 ? "left" : ob.maxY <= b.minY + 14 ? "top" : ob.minY >= b.maxY - 14 ? "bottom" : "adjoining";
      return { name: o.name, type: o.type, side, paint: describePaint(o.paint) };
    });

  return {
    room: { name: room.name, type: room.type, widthIn: r1(b.width), depthIn: r1(b.height), outline: room.polygon.map(loc), edges, paint: describePaint(room.paint) },
    openings,
    fixtures: plan.items.filter((i) => i.shape === "fixture" && pointInPolygon({ x: i.x, y: i.y }, room.polygon, 0)).map(local),
    furniture: roomFurniture(plan.items, room).map((i) => ({ ...local(i), id: i.id, status: i.status })),
    neighbors,
    house: plan.rooms.map((o) => ({ name: o.name, type: o.type, areaSqFt: Math.round(polygonArea(o.polygon) / 144), paint: describePaint(o.paint, false) })),
    style: plan.style,
  };
}

/** Turn Claude's placements (room coordinates) into plan furniture, reusing kept pieces' details. */
export function placedToItems(plan: Plan, room: Room, placed: PlacedItem[], idFor: () => string): Item[] {
  const b = bbox(room.polygon);
  const existing = new Map(roomFurniture(plan.items, room).map((i) => [i.id, i]));
  return tidyItems(placed.map((p) => {
    const kept = p.keepId ? existing.get(p.keepId) : undefined;
    const entry = catalogEntry(p.catalogKey);
    const base: Item = kept ?? {
      id: idFor(), catalogKey: entry ? entry.key : "custom", label: p.label, category: entry?.category ?? normalizeCategory(p.category, p.label),
      shape: entry?.shape ?? p.shape, x: 0, y: 0, width: p.width, depth: p.depth, height: entry?.height ?? null, rotation: 0,
      flip: false, color: "", status: "planned", notes: p.why, shopResults: null,
    };
    return {
      ...base,
      x: Math.round(p.x + b.minX),
      y: Math.round(p.y + b.minY),
      // A kept piece keeps its real size; new pieces use what Claude chose.
      width: kept ? kept.width : p.width,
      depth: kept ? kept.depth : p.depth,
      rotation: ((Math.round(p.rotation / 15) * 15) % 360 + 360) % 360,
    };
  }));
}

/**
 * Nudge pieces that overlap each other, the room's fixtures, a door swing, or poke through a
 * wall into the nearest spot that's clear. Returns the fixed items and how many couldn't be fixed.
 */
export function repairLayout(plan: Plan, room: Room, items: Item[], stay: Item[] = []): { items: Item[]; moved: number; unresolved: number } {
  // `stay`: pieces that must not move (ones a chat edit didn't touch); the others route around them.
  const fixed: Item[] = [...stay];
  const blockers = plan.items
    .filter((i) => i.shape === "fixture" || i.shape === "door")
    .map((i) => (i.shape === "door" ? [doorSwing(i)] : itemParts(i)));
  const rugs = new Set(["rug"]);
  const ok = (it: Item) =>
    polygonInside(itemCorners(it), room.polygon) &&
    !blockers.some((bl) => partsOverlap(itemParts(it), bl)) &&
    (rugs.has(it.category) || !fixed.some((o) => !rugs.has(o.category) && !nests(o, it) && partsOverlap(itemParts(it), itemParts(o))));
  let moved = 0, unresolved = 0;
  // Big pieces first: they're hardest to place, and small ones can fit around them.
  const order = [...items].sort((a, z) => z.width * z.depth - a.width * a.depth);
  for (const it of order) {
    if (ok(it)) { fixed.push(it); continue; }
    let found: Item | null = null;
    for (let r = 2; r <= 48 && !found; r += 2) {
      for (let a = 0; a < 360 && !found; a += 30) {
        const cand = { ...it, x: Math.round(it.x + r * Math.cos((a * Math.PI) / 180)), y: Math.round(it.y + r * Math.sin((a * Math.PI) / 180)) };
        if (ok(cand)) found = cand;
      }
    }
    if (found) { fixed.push(found); moved++; } else { fixed.push(it); unresolved++; }
  }
  // Keep Claude's order for display.
  const byId = new Map(fixed.map((i) => [i.id, i]));
  return { items: items.map((i) => byId.get(i.id)!), moved, unresolved };
}

/** Chairs tuck under desks and tables; ottomans sit against sofas. */
function nests(a: Item, b: Item): boolean {
  const pairs: Array<[string, string]> = [["office chair", "desk"], ["dining chair", "dining table"], ["ottoman", "sofa"], ["ottoman", "sectional"]];
  return pairs.some(([x, y]) => (a.category === x && b.category === y) || (a.category === y && b.category === x));
}

/**
 * Apply a chat reply's changes to the room's live furniture. Only the pieces it adds or
 * updates may be nudged to fit; everything else stays put.
 */
export function applyChatChanges(
  plan: Plan,
  room: Room,
  changes: RoomChatResponse["changes"],
  idFor: () => string,
): { items: Item[]; summary: string[]; unresolved: number } {
  let live = roomFurniture(plan.items, room);
  const touched = new Set<string>();
  const summary: string[] = [];
  const b = bbox(room.polygon);
  for (const c of changes) {
    if (c.op === "remove" && c.id) {
      const it = live.find((i) => i.id === c.id);
      if (it) {
        live = live.filter((i) => i.id !== c.id);
        summary.push(`removed ${it.label || it.category}`);
      }
    } else if (c.op === "add" && c.item) {
      const [it] = placedToItems(plan, room, [{ ...c.item, keepId: null }], idFor);
      live = [...live, it];
      touched.add(it.id);
      summary.push(`added ${it.label}`);
    } else if (c.op === "update" && c.id && c.item) {
      const old = live.find((i) => i.id === c.id);
      if (!old) continue;
      const upd: Item = {
        ...old,
        label: c.item.label || old.label,
        x: Math.round(c.item.x + b.minX),
        y: Math.round(c.item.y + b.minY),
        width: c.item.width > 0 ? c.item.width : old.width,
        depth: c.item.depth > 0 ? c.item.depth : old.depth,
        rotation: ((Math.round(c.item.rotation / 15) * 15) % 360 + 360) % 360,
      };
      live = live.map((i) => (i.id === c.id ? upd : i));
      touched.add(upd.id);
      summary.push(`moved ${upd.label || upd.category}`);
    }
  }
  const stay = live.filter((i) => !touched.has(i.id));
  const { items: fixedTouched, unresolved } = repairLayout(plan, room, live.filter((i) => touched.has(i.id)), stay);
  const byId = new Map(fixedTouched.map((i) => [i.id, i]));
  return { items: live.map((i) => byId.get(i.id) ?? i), summary, unresolved };
}

const SEATS = new Set(["office chair", "dining chair", "chair", "desk chair", "task chair"]);
const WORK_SURFACES = new Set(["desk", "dining table", "table", "vanity"]);

/**
 * A desk or table's front is the side you sit at. If its chair is on the back side, it's been
 * turned the wrong way round (easy to do, since a rectangle looks the same both ways): turn it
 * to face the chair, so clearances are measured on the right side.
 */
export function orientToChairs(items: Item[]): Item[] {
  return items.map((it) => {
    if (!WORK_SURFACES.has(it.category)) return it;
    const r = (it.rotation * Math.PI) / 180;
    const front = { x: -Math.sin(r), y: Math.cos(r) }; // rotation 0 faces +y (down)
    const reach = Math.max(it.width, it.depth) * 0.9;
    const chairs = items.filter((c) => SEATS.has(c.category) && Math.hypot(c.x - it.x, c.y - it.y) <= reach);
    if (!chairs.length) return it;
    const ahead = chairs.reduce((s, c) => s + Math.sign((c.x - it.x) * front.x + (c.y - it.y) * front.y), 0);
    return ahead < 0 ? { ...it, rotation: (it.rotation + 180) % 360 } : it;
  });
}

const CATEGORY_WORDS: Array<[RegExp, string]> = [
  [/\b(task|desk|office|computer)\s+chair\b/i, "office chair"],
  [/\bdining\s+chair\b/i, "dining chair"],
  [/\b(lounge|accent|reading|arm)\s*chair\b/i, "armchair"],
  [/\bbook\s*(case|shelf|shelves)\b/i, "bookcase"],
  [/\bfile\s+cabinet\b/i, "file cabinet"],
  [/\bcredenza|sideboard|buffet\b/i, "sideboard"],
  [/\bside\s+table|end\s+table\b/i, "side table"],
  [/\bcoffee\s+table\b/i, "coffee table"],
  [/\bdesk\b/i, "desk"],
  [/\brug\b/i, "rug"],
  [/\blamp\b/i, "lamp"],
  [/\b(plant|fig|planter|palm|fern)\b/i, "plant"],
  [/\b(loveseat|sofa|couch)\b/i, "sofa"],
  [/\bottoman|pouf\b/i, "ottoman"],
];
const GENERIC = new Set(["seating", "storage", "lighting", "decor", "furniture", "table", "surface", "greenery", "textile", "other"]);

/** A specific category (desk, office chair, bookcase…) from Claude's category and label. */
export function normalizeCategory(category: string, label: string): string {
  const c = category.trim().toLowerCase();
  for (const [re, cat] of CATEGORY_WORDS) if (re.test(label) || re.test(c)) return cat;
  return GENERIC.has(c) ? (label.trim().toLowerCase() || c) : c;
}

/** Give custom pieces specific categories and turn desks and tables to face their chairs. */
export function tidyItems(items: Item[]): Item[] {
  return orientToChairs(items.map((i) => {
    const entry = catalogEntry(i.catalogKey);
    if (entry && GENERIC.has(i.category.toLowerCase())) return { ...i, category: entry.category };
    return entry ? i : { ...i, category: normalizeCategory(i.category, i.label) };
  }));
}
