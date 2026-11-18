import { describe, expect, it } from "vitest";
import { emptyStyle, type Item, type Plan } from "../../shared/schemas";
import { rectLocal } from "./geometry";
import { bestPrice, onboardingSteps, planSummary } from "./planProgress";

const plan = (p: Partial<Plan> = {}): Plan => ({
  id: "p", name: "P", createdAt: "", updatedAt: "", image: null, pxPerInch: null, wallThickness: 5, style: emptyStyle(), rooms: [], items: [], ...p,
});
const piece = (p: Partial<Item>): Item => ({
  id: "i", catalogKey: "custom", label: "Sofa", category: "sofa", shape: "rect", x: 50, y: 50, width: 84, depth: 36,
  height: null, rotation: 0, color: null, status: "existing", notes: "", shopResults: null, ...p,
} as Item);
const product = (price: number | null, fit: "fits" | "too-big") => ({
  name: "X", retailer: "R", url: "", price, currency: "USD", widthIn: 1, depthIn: 1, heightIn: 1, color: "", material: "",
  whyItFits: "", dimensionsSource: "", fit, fitNote: "",
});

describe("getting started", () => {
  it("starts with nothing done and ticks steps off from what's on the plan", () => {
    expect(onboardingSteps(plan()).filter((s) => s.done)).toHaveLength(0);
    const rooms = [{ id: "r", name: "Living", type: "living" as const, polygon: rectLocal(0, 0, 200, 200) }];
    const steps = onboardingSteps(plan({ rooms, items: [piece({})] }));
    expect(steps.map((s) => s.done)).toEqual([true, true, true, true, false]);
  });

  it("counts choosing the blank grid as adding a plan with its own scale", () => {
    expect(onboardingSteps(plan(), true).map((s) => s.done)).toEqual([true, true, false, false, false]);
  });

  it("doesn't count doors and windows as furniture", () => {
    const steps = onboardingSteps(plan({ pxPerInch: 2, items: [piece({ shape: "door", category: "door" })] }));
    expect(steps.find((s) => s.id === "furniture")!.done).toBe(false);
  });
});

describe("plan summary", () => {
  it("prices to-buy pieces from their cheapest saved product that isn't too big", () => {
    const shopped = piece({ status: "to-buy", shopResults: { searchedAt: "", query: { width: 84, depth: 36, height: null }, summary: "", products: [product(900, "too-big"), product(1200, "fits"), product(null, "fits")] } });
    expect(bestPrice(shopped)).toBe(1200);
    const rooms = [{ id: "r", name: "Living", type: "living" as const, polygon: rectLocal(0, 0, 200, 200) }];
    const s = planSummary(plan({ rooms, items: [shopped, piece({ id: "j", status: "to-buy", x: 500 })] }));
    expect(s.rooms[0].pieces).toBe(1);
    expect(s.toBuy).toHaveLength(2);
    expect(s.toBuy[0].room?.name).toBe("Living");
    expect(s.estimate).toEqual({ total: 1200, priced: 1 });
  });
});
