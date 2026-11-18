import { describe, expect, it } from "vitest";
import type { Item, ShopResults } from "../../shared/schemas";
import { reusableShopResults } from "./shopReuse";

const results = (width: number, depth: number, searchedAt = "2026-11-17T10:00:00Z"): ShopResults =>
  ({ searchedAt, query: { width, depth, height: null }, summary: "", products: [] });
let n = 0;
const item = (p: Partial<Item>): Item => ({
  id: `i${++n}`, catalogKey: "nightstand", label: "Nightstand", category: "nightstand", shape: "rect", width: 24, depth: 16, height: null,
  rotation: 0, flip: false, color: "", status: "to-buy", notes: "", shopResults: null, x: 0, y: 0, ...p,
});

describe("reusing shop results", () => {
  it("finds the other nightstand of a pair, even turned the other way", () => {
    const left = item({ label: "Nightstand (left)", shopResults: results(24, 16) });
    const right = item({ label: "Nightstand (right)", width: 16, depth: 24, rotation: 90 });
    expect(reusableShopResults(right, [left, right])?.id).toBe(left.id);
  });

  it("ignores pieces of another kind or size, and picks the newest search", () => {
    const desk = item({ label: "Desk", category: "desk", shopResults: results(24, 16) });
    const big = item({ shopResults: results(30, 18) });
    const older = item({ shopResults: results(24, 16, "2026-11-01T00:00:00Z") });
    const newer = item({ shopResults: results(24.5, 16, "2026-11-10T00:00:00Z") });
    const me = item({});
    expect(reusableShopResults(me, [desk, big, older, newer, me])?.id).toBe(newer.id);
    expect(reusableShopResults(me, [desk, big, me])).toBeNull();
  });
});
