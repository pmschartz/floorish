import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let savedAnswer: typeof import("./aiCache").savedAnswer;
let spendSummary: typeof import("./usage").spendSummary;
let recordUsage: typeof import("./usage").recordUsage;
let requestPlan: typeof import("./usage").requestPlan;

beforeAll(async () => {
  process.env.HOUSE_PLANNER_DATA = mkdtempSync(path.join(tmpdir(), "hp-test-"));
  ({ savedAnswer } = await import("./aiCache"));
  ({ spendSummary, recordUsage, requestPlan } = await import("./usage"));
});

describe("saved answers", () => {
  it("answers the same request again for free, and asks again when forced", async () => {
    let calls = 0;
    const run = async () => ({ n: ++calls });
    expect(await savedAnswer("redesign", { room: "a" }, false, run)).toEqual({ value: { n: 1 }, reused: false });
    expect(await savedAnswer("redesign", { room: "a" }, false, run)).toEqual({ value: { n: 1 }, reused: true });
    expect(await savedAnswer("redesign", { room: "b" }, false, run)).toEqual({ value: { n: 2 }, reused: false });
    expect(await savedAnswer("redesign", { room: "a" }, true, run)).toEqual({ value: { n: 3 }, reused: false });
    expect(calls).toBe(3);
  });

  it("shares one call between two identical requests at the same time", async () => {
    let calls = 0;
    const run = () => new Promise<number>((r) => setTimeout(() => r(++calls), 20));
    const [a, b] = await Promise.all([savedAnswer("detect", { img: 1 }, false, run), savedAnswer("detect", { img: 1 }, false, run)]);
    expect(calls).toBe(1);
    expect([a.value, b.value]).toEqual([1, 1]);
  });
});

describe("spend summary", () => {
  it("adds up cost per plan and per kind", async () => {
    await requestPlan.run("plan-1", () => recordUsage({ kind: "shop round 1", model: "m", cost: 0.1 }));
    await requestPlan.run("plan-1", () => recordUsage({ kind: "shop round 2", model: "m", cost: 0.05 }));
    await requestPlan.run("plan-2", () => recordUsage({ kind: "redesign", model: "m", cost: 0.4 }));
    const s = await spendSummary("plan-1");
    expect(s.plan).toBeCloseTo(0.15);
    expect(s.total).toBeGreaterThanOrEqual(0.55 - 1e-9);
    expect(s.byKind).toEqual([{ kind: "shop", cost: expect.closeTo(0.15), calls: 2 }]);
  });
});
