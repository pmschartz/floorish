import { describe, expect, it } from "vitest";
import { scoreFit } from "../../shared/fit";
import { clearanceZone, convexOverlap, doorSwing, itemCorners, pointInPolygon, polygonArea, rectLocal } from "./geometry";
import { formatArea, formatLength, parseLength } from "./units";

describe("parseLength", () => {
  it.each([
    ["12'", 144],
    ["12 ft", 144],
    [`12' 6"`, 150],
    ["12'6", 150],
    ["12 ft 6 in", 150],
    [`150"`, 150],
    ["150 in", 150],
    ["150", 150],
    ["2.54cm", 1],
    ["1m", 100 / 2.54],
    ["254 mm", 10],
    ["6′8″", 80],
  ])("%s → %d in", (input, expected) => {
    expect(parseLength(input, "imperial")).toBeCloseTo(expected, 5);
  });

  it("treats bare numbers as cm in metric mode", () => {
    expect(parseLength("254", "metric")).toBeCloseTo(100, 5);
  });

  it("rejects junk", () => {
    expect(parseLength("", "imperial")).toBeNull();
    expect(parseLength("abc", "imperial")).toBeNull();
    expect(parseLength("12 parsecs", "imperial")).toBeNull();
  });
});

describe("formatLength / formatArea", () => {
  it("formats feet and inches", () => {
    expect(formatLength(80, "imperial")).toBe(`6' 8"`);
    expect(formatLength(144, "imperial")).toBe(`12'`);
    expect(formatLength(9.5, "imperial")).toBe(`9.5"`);
  });
  it("formats metric", () => {
    expect(formatLength(10, "metric")).toBe("25 cm");
    expect(formatLength(100, "metric")).toBe("2.54 m");
  });
  it("formats area", () => {
    expect(formatArea(144 * 120, "imperial")).toBe("120 sq ft");
  });
});

describe("geometry", () => {
  const square = rectLocal(0, 0, 120, 120);

  it("computes polygon area", () => {
    expect(polygonArea(square)).toBe(14400);
    // L-shaped room: 10'x10' with a 5'x5' notch
    const L = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 60 }, { x: 60, y: 60 }, { x: 60, y: 120 }, { x: 0, y: 120 }];
    expect(polygonArea(L)).toBe(14400 - 3600);
  });

  it("point in polygon (edges count as inside)", () => {
    expect(pointInPolygon({ x: 60, y: 60 }, square)).toBe(true);
    expect(pointInPolygon({ x: 0, y: 60 }, square)).toBe(true);
    expect(pointInPolygon({ x: 130, y: 60 }, square)).toBe(false);
  });

  it("rotated corners", () => {
    const c = itemCorners({ x: 0, y: 0, width: 20, depth: 10, rotation: 90 });
    const xs = c.map((p) => Math.round(p.x)).sort((a, b) => a - b);
    const ys = c.map((p) => Math.round(p.y)).sort((a, b) => a - b);
    expect([xs[0], xs[3]]).toEqual([-5, 5]);
    expect([ys[0], ys[3]]).toEqual([-10, 10]);
  });

  it("overlap: touching is fine, overlapping isn't, rotation matters", () => {
    const a = itemCorners({ x: 10, y: 10, width: 20, depth: 20, rotation: 0 });
    const touching = itemCorners({ x: 30, y: 10, width: 20, depth: 20, rotation: 0 });
    const overlapping = itemCorners({ x: 25, y: 10, width: 20, depth: 20, rotation: 0 });
    expect(convexOverlap(a, touching)).toBe(false);
    expect(convexOverlap(a, overlapping)).toBe(true);
    // A diamond whose bounding box overlaps but the shape itself doesn't.
    const diamond = itemCorners({ x: 34, y: 34, width: 14, depth: 14, rotation: 45 });
    expect(convexOverlap(a, diamond)).toBe(false);
  });

  it("clearance zones sit on the requested side", () => {
    const front = clearanceZone({ x: 0, y: 0, width: 40, depth: 20, rotation: 0 }, "front", 36);
    expect(Math.min(...front.map((p) => p.y))).toBeCloseTo(10);
    expect(Math.max(...front.map((p) => p.y))).toBeCloseTo(46);
    const rotated = clearanceZone({ x: 0, y: 0, width: 40, depth: 20, rotation: 180 }, "front", 36);
    expect(Math.min(...rotated.map((p) => p.y))).toBeCloseTo(-46);
  });

  it("door swing covers a quarter circle in front of the door", () => {
    const swing = doorSwing({ x: 15, y: 0, width: 30, depth: 2, rotation: 0 });
    const ys = swing.map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(31);
    expect(Math.min(...ys)).toBeCloseTo(1);
  });
});

describe("scoreFit", () => {
  const t = { width: 36, depth: 12, height: 72, toleranceUnder: 2, toleranceOver: 1 };
  it("fits when at or under", () => {
    expect(scoreFit({ widthIn: 35.5, depthIn: 11.8, heightIn: 71 }, t).fit).toBe("fits");
  });
  it("accepts swapped width/depth", () => {
    expect(scoreFit({ widthIn: 12, depthIn: 36, heightIn: null }, t).fit).toBe("fits");
  });
  it("tight when within over-tolerance", () => {
    const r = scoreFit({ widthIn: 36.75, depthIn: 12, heightIn: null }, t);
    expect(r.fit).toBe("tight");
    expect(r.fitNote).toContain("too wide");
  });
  it("too big beyond tolerance, including height", () => {
    expect(scoreFit({ widthIn: 40, depthIn: 12, heightIn: null }, t).fit).toBe("too-big");
    expect(scoreFit({ widthIn: 36, depthIn: 12, heightIn: 80 }, t).fit).toBe("too-big");
  });
  it("unknown when dimensions are missing", () => {
    expect(scoreFit({ widthIn: null, depthIn: 12, heightIn: null }, t).fit).toBe("unknown");
  });
  it("notes when much smaller than the shape", () => {
    expect(scoreFit({ widthIn: 30, depthIn: 12, heightIn: null }, t).fitNote).toContain("6\" narrower");
  });
});

describe("sectional outlines", () => {
  it("U outline area is the box minus the opening", async () => {
    const { outlineLocal, armDepth } = await import("./geometry");
    const t = armDepth("U", 132, 96);
    expect(t).toBe(38);
    expect(polygonArea(outlineLocal("U", 132, 96))).toBeCloseTo(132 * 96 - (132 - 2 * t) * (96 - t));
  });
});

describe("placeLabel", () => {
  const room = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 100 }, { x: 0, y: 100 }];
  const rect = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

  it("sits in the middle of an empty room", async () => {
    const { placeLabel } = await import("./labels");
    expect(placeLabel(room, [], 30, 10)).toEqual({ at: { x: 60, y: 50 }, fits: true });
  });

  it("moves off a bed in the middle of the room", async () => {
    const { placeLabel } = await import("./labels");
    const bed = rect(40, 20, 80, 80);
    const { at, fits } = placeLabel(room, [bed], 30, 10);
    expect(fits).toBe(true);
    const clear = at.y + 5 <= 20 || at.y - 5 >= 80 || at.x + 15 <= 40 || at.x - 15 >= 80;
    expect(clear).toBe(true);
  });

  it("stays inside an L-shaped room", async () => {
    const { placeLabel } = await import("./labels");
    const { pointInPolygon } = await import("./geometry");
    const L = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 80 }, { x: 120, y: 80 }, { x: 120, y: 120 }, { x: 0, y: 120 }];
    const { at, fits } = placeLabel(L, [], 20, 8);
    expect(fits).toBe(true);
    expect(pointInPolygon(at, L, 0)).toBe(true);
  });

  it("reports when the label is bigger than the room", async () => {
    const { placeLabel } = await import("./labels");
    expect(placeLabel(rect(0, 0, 20, 10), [], 40, 12).fits).toBe(false);
  });
});
