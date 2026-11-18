import type { Item, Plan, Room } from "../../shared/schemas";
import { pointInPolygon, polygonArea } from "./geometry";

const BUILT_IN = new Set<Item["shape"]>(["door", "window", "opening", "fixture"]);

export type StepId = "upload" | "calibrate" | "rooms" | "furniture" | "ideas";
export interface Step { id: StepId; title: string; done: boolean }

/**
 * The getting-started checklist, worked out from what's on the plan. The scale counts as set
 * once it's calibrated, or once you're drawing on the blank grid (which has its own scale).
 */
export function onboardingSteps(plan: Plan, gridChosen = false): Step[] {
  const furniture = plan.items.filter((i) => !BUILT_IN.has(i.shape));
  const started = plan.rooms.length > 0 || furniture.length > 0 || gridChosen;
  return [
    { id: "upload", title: "Add your floor plan", done: !!plan.image || started },
    { id: "calibrate", title: "Set the scale", done: plan.pxPerInch != null || (!plan.image && started) },
    { id: "rooms", title: "Mark out the rooms", done: plan.rooms.length > 0 },
    { id: "furniture", title: "Bring in your furniture", done: furniture.length > 0 },
    {
      id: "ideas",
      title: "Get ideas from Claude",
      done: plan.rooms.some((r) => !!r.suggestions || !!r.versions?.length || !!r.chat?.length) || plan.items.some((i) => !!i.shopResults),
    },
  ];
}

/** The room a piece sits in (by its centre), if any. */
export function roomOf(item: Pick<Item, "x" | "y">, rooms: Room[]): Room | undefined {
  return rooms.find((r) => pointInPolygon({ x: item.x, y: item.y }, r.polygon, 0));
}

/** The lowest saved price for a piece that isn't too big, if it has been shopped for. */
export function bestPrice(item: Item): number | null {
  const prices = (item.shopResults?.products ?? [])
    .filter((p) => p.fit !== "too-big" && p.price != null)
    .map((p) => p.price as number);
  return prices.length ? Math.min(...prices) : null;
}

export interface PlanSummary {
  area: number; // sq in
  rooms: Array<{ room: Room; area: number; pieces: number }>;
  pieces: number;
  toBuy: Array<{ item: Item; room?: Room; price: number | null }>;
  /** Sum of the best saved prices, and how many to-buy pieces have one. */
  estimate: { total: number; priced: number };
}

export function planSummary(plan: Plan): PlanSummary {
  const furniture = plan.items.filter((i) => !BUILT_IN.has(i.shape));
  const rooms = plan.rooms.map((room) => ({
    room,
    area: polygonArea(room.polygon),
    pieces: furniture.filter((i) => roomOf(i, [room])).length,
  }));
  const toBuy = furniture
    .filter((i) => i.status === "to-buy")
    .map((item) => ({ item, room: roomOf(item, plan.rooms), price: bestPrice(item) }));
  const priced = toBuy.filter((t) => t.price != null);
  return {
    area: rooms.reduce((t, r) => t + r.area, 0),
    rooms,
    pieces: furniture.length,
    toBuy,
    estimate: { total: priced.reduce((t, x) => t + (x.price ?? 0), 0), priced: priced.length },
  };
}
