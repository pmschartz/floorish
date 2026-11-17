import type { Item, Room } from "../../shared/schemas";
import { clearancesFor, PASSIVE_CATEGORIES } from "../catalog/furniture";
import { clearanceZone, doorSwing, itemCorners, itemParts, partsOverlap, pointInPolygon, polygonInside } from "../model/geometry";

export type IssueKind = "overlap" | "outside-room" | "clearance" | "door-swing";

export interface Issue {
  id: string;
  kind: IssueKind;
  severity: "error" | "warning";
  message: string;
  itemIds: string[];
}

/** Pairs that are meant to sit together (a chair tucked under a desk). */
const NESTS: Array<[string, string]> = [
  ["office chair", "desk"],
  ["dining chair", "dining table"],
  ["ottoman", "sofa"],
  ["ottoman", "sectional"],
];
const nests = (a: string, b: string) => NESTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

const isSolid = (i: Item) => !PASSIVE_CATEGORIES.has(i.category) && i.shape !== "door" && i.shape !== "window" && i.shape !== "opening";
const name = (i: Item) => i.label || i.category || "Item";

export function roomFor(item: Pick<Item, "x" | "y">, rooms: Room[]): Room | undefined {
  return rooms.find((r) => r.polygon.length >= 3 && pointInPolygon({ x: item.x, y: item.y }, r.polygon));
}

export function runLayoutChecks(items: Item[], rooms: Room[], fmt: (inches: number) => string = (n) => `${Math.round(n)}"`): Issue[] {
  const issues: Issue[] = [];
  const solids = items.filter(isSolid);
  const corners = new Map(items.map((i) => [i.id, itemCorners(i)]));
  const parts = new Map(items.map((i) => [i.id, itemParts(i)]));

  // 1. Overlaps
  for (let a = 0; a < solids.length; a++) {
    for (let b = a + 1; b < solids.length; b++) {
      const A = solids[a], B = solids[b];
      if (nests(A.category, B.category)) continue;
      // Fixtures stack on purpose (a sink in a counter, a dishwasher under it).
      if (A.shape === "fixture" && B.shape === "fixture") continue;
      if (partsOverlap(parts.get(A.id)!, parts.get(B.id)!)) {
        issues.push({
          id: `overlap:${A.id}:${B.id}`,
          kind: "overlap",
          severity: "error",
          message: `${name(A)} overlaps ${name(B)}`,
          itemIds: [A.id, B.id],
        });
      }
    }
  }

  // 2. Outside every room (only once rooms have been traced)
  const traced = rooms.filter((r) => r.polygon.length >= 3);
  if (traced.length) {
    // Fixtures come from the drawing and hug the walls; only check furniture.
    for (const it of solids.filter((i) => i.shape !== "fixture")) {
      const c = corners.get(it.id)!;
      if (!traced.some((r) => polygonInside(c, r.polygon))) {
        issues.push({
          id: `outside:${it.id}`,
          kind: "outside-room",
          severity: "warning",
          message: `${name(it)} runs through a wall or sits outside the traced rooms`,
          itemIds: [it.id],
        });
      }
    }
  }

  // 3. Clearances
  for (const it of solids) {
    const room = roomFor(it, traced);
    for (const rule of clearancesFor(it)) {
      const allow = new Set([...(rule.allow ?? []), ...PASSIVE_CATEGORIES]);
      const blockersAt = (dist: number) =>
        solids.filter(
          (o) => o.id !== it.id && !allow.has(o.category) && !nests(o.category, it.category) &&
            partsOverlap([clearanceZone(it, rule.side, dist)], parts.get(o.id)!),
        );
      const wallAt = (dist: number) => !!room && !polygonInside(clearanceZone(it, rule.side, dist), room.polygon);
      const blocked = (dist: number) => wallAt(dist) || blockersAt(dist).length > 0;

      if (!blocked(rule.dist)) continue;

      // Binary-search how much clear space there actually is.
      let lo = 0, hi = rule.dist;
      for (let k = 0; k < 12; k++) {
        const mid = (lo + hi) / 2;
        if (blocked(mid)) hi = mid; else lo = mid;
      }
      const blockers = blockersAt(rule.dist);
      const by = wallAt(rule.dist) && blockers.length === 0 ? "a wall" : blockers.map(name).join(", ");
      const sideWord = rule.side === "front" ? "in front" : rule.side === "back" ? "behind it" : `on its ${rule.side}`;
      issues.push({
        id: `clearance:${it.id}:${rule.side}`,
        kind: "clearance",
        severity: "warning",
        message: `${name(it)} needs ${fmt(rule.dist)} clear ${sideWord} (${rule.why}); only about ${fmt(lo)} before ${by}`,
        itemIds: [it.id, ...blockers.map((b) => b.id)],
      });
    }
  }

  // 4. Door swings
  for (const door of items.filter((i) => i.shape === "door")) {
    const swing = doorSwing(door);
    // Fixtures come from the drawing, which is drawn so its doors clear them; check furniture.
    for (const it of solids.filter((i) => i.shape !== "fixture")) {
      if (partsOverlap([swing], parts.get(it.id)!)) {
        issues.push({
          id: `door:${door.id}:${it.id}`,
          kind: "door-swing",
          severity: "error",
          message: `${name(it)} blocks the swing of ${name(door)}`,
          itemIds: [it.id, door.id],
        });
      }
    }
  }

  return issues;
}
