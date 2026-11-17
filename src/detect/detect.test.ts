import { describe, expect, it } from "vitest";
import type { RawDetection } from "../../shared/schemas";
import { buildProposal, doorPose } from "./buildProposal";
import { alignOpenEdges, defaultOpts, polygonFromEdges, snapOpening, snapRoomEdges, type Mask, type SnappedEdge } from "./snap";

/**
 * Synthetic 400×300 plan, 6px walls:
 *  Room A interior x 50–200, y 50–150. Room B interior x 206–350, y 50–150.
 *  Shared wall at x 200–205 with a doorway at y 80–110.
 *  Window in A's top wall at x 100–140 (only two thin lines remain in the wall).
 */
function plan(): Mask {
  const w = 400, h = 300;
  const data = new Uint8Array(w * h);
  const fill = (x0: number, y0: number, x1: number, y1: number, v = 1) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * w + x] = v;
  };
  fill(44, 44, 355, 49); // top wall
  fill(44, 150, 355, 155); // bottom wall
  fill(44, 44, 49, 155); // left wall
  fill(350, 44, 355, 155); // right wall
  fill(200, 44, 205, 155); // shared wall
  fill(200, 80, 205, 110, 0); // doorway
  fill(100, 44, 140, 49, 0); // window gap...
  fill(100, 44, 140, 44); // ...with its frame lines
  fill(100, 49, 140, 49);
  fill(120, 95, 135, 96); // a thin line of text inside the room (should be ignored)
  return { w, h, data };
}

describe("snapping to walls", () => {
  const m = plan();
  const o = defaultOpts(m);

  it("moves a rough room outline onto the inside faces of its walls", () => {
    const rough = [{ x: 55, y: 56 }, { x: 196, y: 54 }, { x: 197, y: 146 }, { x: 53, y: 147 }];
    const edges = snapRoomEdges(rough, m, o);
    expect(edges.map((e) => e.wall)).toEqual([6, 6, 6, 6]);
    expect(polygonFromEdges(rough, edges)).toEqual([{ x: 50, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 150 }, { x: 50, y: 150 }]);
  });

  it("works for counter-clockwise outlines too", () => {
    const rough = [{ x: 53, y: 147 }, { x: 197, y: 146 }, { x: 196, y: 54 }, { x: 55, y: 56 }];
    expect(polygonFromEdges(rough, snapRoomEdges(rough, m, o))).toEqual([
      { x: 50, y: 150 }, { x: 200, y: 150 }, { x: 200, y: 50 }, { x: 50, y: 50 },
    ]);
  });

  it("marks an edge with no wall as open", () => {
    // An edge drawn through the middle of room A, far from any wall.
    const rough = [{ x: 50, y: 50 }, { x: 200, y: 50 }, { x: 200, y: 120 }, { x: 50, y: 120 }];
    const edges = snapRoomEdges(rough, m, o);
    expect(edges[2].wall).toBeNull();
    expect(edges[2].coord).toBe(120);
  });

  it("finds a doorway's exact gap and centers it on the wall", () => {
    const s = snapOpening({ x: 202, y: 83 }, { x: 204, y: 107 }, m, o);
    expect(s).toEqual({ axis: "v", perp: 203, start: 80, end: 111, thickness: 6, gapFound: true });
  });

  it("finds a window drawn as thin lines in the wall", () => {
    const s = snapOpening({ x: 97, y: 46 }, { x: 143, y: 47 }, m, o);
    expect(s).toMatchObject({ axis: "h", perp: 47, start: 100, end: 141, thickness: 6 });
  });

  it("lines up open-plan neighbours", () => {
    const a: SnappedEdge = { axis: "v", coord: 100, inward: -1, wall: null, span: [0, 50] };
    const b: SnappedEdge = { axis: "v", coord: 104, inward: 1, wall: null, span: [10, 60] };
    alignOpenEdges([[a], [b]], 8);
    expect(a.coord).toBe(102);
    expect(b.coord).toBe(102);
  });
});

describe("doorPose", () => {
  it("horizontal wall, hinge on the left, swinging down", () => {
    expect(doorPose({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 10, y: 10 })).toEqual({ rotation: 0, flip: false });
  });
  it("horizontal wall, hinge on the right, swinging down", () => {
    expect(doorPose({ x: 30, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toEqual({ rotation: 0, flip: true });
  });
  it("horizontal wall, hinge on the left, swinging up", () => {
    expect(doorPose({ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 10, y: -10 })).toEqual({ rotation: 180, flip: true });
  });
  it("vertical wall, hinge at the top, swinging left", () => {
    expect(doorPose({ x: 0, y: 0 }, { x: 0, y: 30 }, { x: -10, y: 10 })).toEqual({ rotation: 90, flip: false });
  });
});

describe("buildProposal", () => {
  const raw: RawDetection = {
    rooms: [
      { name: "Bedroom", type: "bedroom", polygon: [{ x: 27, y: 28 }, { x: 99, y: 27 }, { x: 99, y: 74 }, { x: 26, y: 74 }], labeledWidthIn: 75, labeledDepthIn: 50 },
      { name: "Office", type: "office", polygon: [{ x: 104, y: 26 }, { x: 174, y: 26 }, { x: 175, y: 74 }, { x: 104, y: 75 }], labeledWidthIn: null, labeledDepthIn: null },
    ],
    doors: [{ kind: "swing", hinge: { x: 101, y: 40 }, otherJamb: { x: 101, y: 55 }, swingToward: { x: 108, y: 45 } }],
    windows: [{ start: { x: 49, y: 23 }, end: { x: 71, y: 23 } }],
    dimensionLines: [], fixtures: [],
    notes: "",
  };

  it("snaps, scales from the printed room size, and converts to inches", () => {
    // Claude saw a half-size copy (factor 2).
    const p = buildProposal(raw, 2, plan(), null);
    expect(p.ppiSource).toBe("printed");
    expect(p.ppi).toBeCloseTo(2, 5); // 150px / 75", 100px / 50"
    expect(p.wallThickness).toBe(3);
    expect(p.rooms[0].polygon).toEqual([{ x: 25, y: 25 }, { x: 100, y: 25 }, { x: 100, y: 75 }, { x: 25, y: 75 }]);
    expect(p.rooms[1].polygon[0]).toEqual({ x: 103, y: 25 });

    const door = p.openings.find((i) => i.shape === "door")!;
    // Hinge at the top, swinging right (into the office): front faces +x, hinge on the flipped end.
    expect(door).toMatchObject({ x: 101.5, y: 47.75, width: 15.5, depth: 3, rotation: 270, flip: true });
    const win = p.openings.find((i) => i.shape === "window")!;
    expect(win).toMatchObject({ x: 60.25, y: 23.5, width: 20.5, rotation: 0 });
  });

  it("uses the plan's own scale when it has one and reports disagreement", () => {
    const p = buildProposal(raw, 2, plan(), 2.2);
    expect(p.ppiSource).toBe("plan");
    expect(p.scaleDisagreement).toBeCloseTo(2 / 2.2, 5);
  });

  it("falls back to door widths", () => {
    const p = buildProposal({ ...raw, rooms: raw.rooms.map((r) => ({ ...r, labeledWidthIn: null, labeledDepthIn: null })) }, 2, plan(), null);
    expect(p.ppiSource).toBe("doors");
    expect(p.ppi).toBeCloseTo(31 / 32, 5);
  });
});

describe("walls that are mostly doorway", () => {
  it("count as walls when a door sits on them", () => {
    // Narrow 40px-tall room B2 to the right of the shared wall, whose edge is almost all doorway.
    const raw: RawDetection = {
      rooms: [{ name: "Hall", type: "hall", polygon: [{ x: 104, y: 39 }, { x: 175, y: 39 }, { x: 175, y: 56 }, { x: 104, y: 56 }], labeledWidthIn: null, labeledDepthIn: null }],
      doors: [{ kind: "swing", hinge: { x: 101, y: 40 }, otherJamb: { x: 101, y: 55 }, swingToward: { x: 108, y: 45 } }],
      windows: [],
      dimensionLines: [], fixtures: [],
      notes: "",
    };
    const p = buildProposal(raw, 2, plan(), 2);
    // Left edge (index 3) runs along the shared wall at x 200–205 → interior face x=206px = 103".
    expect(p.rooms[0].walls![3]).toBe(3);
    expect(p.rooms[0].polygon[0].x).toBe(103);
  });
});

describe("garage-style walls", () => {
  it("an exterior wall that's all garage door still counts as a wall", () => {
    // 200×200 room interior x 20–180, y 20–150; three solid 6px walls, the bottom is only a thin door line.
    const w = 220, h = 200, data = new Uint8Array(w * h);
    const fill = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * w + x] = 1;
    };
    fill(14, 14, 186, 19); fill(14, 14, 19, 156); fill(181, 14, 186, 156);
    fill(20, 153, 180, 153); // garage door drawn as a single thin line
    const raw: RawDetection = {
      rooms: [{ name: "Garage", type: "garage", polygon: [{ x: 22, y: 22 }, { x: 178, y: 22 }, { x: 178, y: 148 }, { x: 22, y: 148 }], labeledWidthIn: null, labeledDepthIn: null }],
      doors: [{ kind: "garage", hinge: { x: 22, y: 153 }, otherJamb: { x: 178, y: 153 }, swingToward: null }],
      windows: [], dimensionLines: [], fixtures: [], notes: "",
    };
    const p = buildProposal(raw, 1, { w, h, data }, 1);
    expect(p.rooms[0].walls).toEqual([6, 6, 6, 6]);
    expect(p.openings[0]).toMatchObject({ shape: "opening", label: "Garage door" });
  });
});

describe("carryOverNames", () => {
  it("keeps names you gave rooms that the detection overlaps", async () => {
    const { carryOverNames } = await import("./buildProposal");
    const sq = (x0: number, y0: number, x1: number, y1: number) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
    const detected = [
      { name: "Bedroom", type: "bedroom" as const, polygon: sq(0, 0, 100, 100) },
      { name: "Foyer", type: "entry" as const, polygon: sq(200, 0, 260, 60) },
    ];
    const existing = [{ id: "a", name: "Paige's Office", type: "office" as const, polygon: sq(-3, -2, 102, 104) }];
    const { rooms, detectedName } = carryOverNames(detected, existing);
    expect(rooms.map((r) => [r.name, r.type])).toEqual([["Paige's Office", "office"], ["Foyer", "entry"]]);
    expect(detectedName).toEqual(["Bedroom", null]);
  });
});

describe("reading doors from their arcs", () => {
  /** plan() plus two drawn doors: one in the shared-wall doorway, one in a new gap in A's bottom wall. */
  function withDoors(): Mask {
    const m = plan();
    const set = (x: number, y: number) => {
      const xi = Math.round(x), yi = Math.round(y);
      if (xi >= 0 && yi >= 0 && xi < m.w && yi < m.h) m.data[yi * m.w + xi] = 1;
    };
    const door = (hx: number, hy: number, r: number, leafDx: number, leafDy: number, arcFrom: number, arcTo: number) => {
      for (let i = 0; i <= r; i++) set(hx + leafDx * i, hy + leafDy * i);
      for (let a = arcFrom; a <= arcTo; a += 0.5) set(hx + r * Math.cos((a * Math.PI) / 180), hy + r * Math.sin((a * Math.PI) / 180));
    };
    // Shared wall doorway y 80–110: hinged at the bottom, swinging right into room B.
    door(206, 111, 31, 1, 0, -90, 0);
    // New doorway in A's bottom wall (rows 150–155) at x 80–110, hinged left, swinging down.
    for (let y = 150; y <= 155; y++) for (let x = 80; x <= 110; x++) m.data[y * m.w + x] = 0;
    door(80, 156, 31, 0, 1, 0, 90);
    return m;
  }

  const raw: RawDetection = {
    rooms: [
      { name: "A", type: "bedroom", polygon: [{ x: 27, y: 28 }, { x: 99, y: 27 }, { x: 99, y: 74 }, { x: 26, y: 74 }], labeledWidthIn: null, labeledDepthIn: null },
      { name: "B", type: "office", polygon: [{ x: 104, y: 26 }, { x: 174, y: 26 }, { x: 175, y: 74 }, { x: 104, y: 75 }], labeledWidthIn: null, labeledDepthIn: null },
    ],
    // Claude got this one backwards: hinge at the top, swinging left.
    doors: [{ kind: "swing", hinge: { x: 101, y: 40 }, otherJamb: { x: 101, y: 55 }, swingToward: { x: 95, y: 45 } }],
    windows: [],
    dimensionLines: [], fixtures: [],
    notes: "",
  };

  it("corrects a backwards door and finds the one Claude missed", () => {
    const m = withDoors();
    const p = buildProposal(raw, 2, m, 1, m);
    const doors = p.openings.filter((o) => o.shape === "door");
    expect(p.correctedDoors).toBe(1);
    expect(p.addedDoors).toBe(1);
    expect(doors).toHaveLength(2);
    // Shared wall: hinge at the bottom, swinging right → front faces +x with the hinge on the unflipped end.
    expect(doors[0]).toMatchObject({ x: 203, y: 95.5, rotation: 270, flip: false });
    // Bottom wall: hinge on the left, swinging down.
    expect(doors[1]).toMatchObject({ x: 95.5, y: 153, width: 31, rotation: 0, flip: false });
  });

  it("moves a door reported a little off its wall onto the real doorway", () => {
    const m = withDoors();
    // Reported 16px left of the shared wall, inside room A (sent-image coords are half-size).
    const off: RawDetection = { ...raw, doors: [{ kind: "swing", hinge: { x: 92, y: 55 }, otherJamb: { x: 92, y: 40 }, swingToward: null }] };
    const p = buildProposal(off, 2, m, 1, m);
    const doors = p.openings.filter((o) => o.shape === "door");
    expect(doors[0]).toMatchObject({ x: 203, y: 95.5, rotation: 270, flip: false });
    expect(p.addedDoors).toBe(1); // only the bottom-wall door is new; the moved one isn't double-counted
  });

  it("warns when a door swings into space no room covers", () => {
    const m = withDoors();
    // B's outline stops 34px short of the shared wall, leaving a nook the door swings into.
    const shortB = { ...raw.rooms[1], polygon: [{ x: 120, y: 26 }, { x: 174, y: 26 }, { x: 175, y: 74 }, { x: 120, y: 75 }] };
    const p = buildProposal({ ...raw, rooms: [raw.rooms[0], shortB] }, 2, m, 1, m);
    expect(p.orphanDoorsNear).toContain("A");
    const both = buildProposal(raw, 2, m, 1, m);
    expect(both.orphanDoorsNear.filter((n) => n === "A")).toHaveLength(0);
  });

  it("drops a door placed where the wall has no gap", () => {
    const m = withDoors();
    const wrong: RawDetection = { ...raw, doors: [{ kind: "swing", hinge: { x: 130, y: 24 }, otherJamb: { x: 145, y: 24 }, swingToward: { x: 135, y: 30 } }] };
    const p = buildProposal(wrong, 2, m, 1, m);
    // The misplaced one is gone; the wall scan still finds both real doors.
    expect(p.openings.filter((o) => o.shape === "door")).toHaveLength(2);
  });
});

describe("fixtures", () => {
  const room: RawDetection["rooms"][number] = {
    name: "A", type: "kitchen", polygon: [{ x: 27, y: 28 }, { x: 99, y: 27 }, { x: 99, y: 74 }, { x: 26, y: 74 }], labeledWidthIn: null, labeledDepthIn: null,
  };
  const raw = (fixtures: RawDetection["fixtures"]): RawDetection => ({ rooms: [room], doors: [], windows: [], fixtures, dimensionLines: [], notes: "" });

  it("pushes a counter flush against its wall and faces it into the room", () => {
    // Claude's box sits 4px (sent-image 2px) off the top wall's inside face at y=50.
    const p = buildProposal(raw([{ kind: "counter", against: "top", box: { x0: 30, y0: 27, x1: 60, y1: 39 } }]), 2, plan(), 1);
    expect(p.fixtures[0]).toMatchObject({ shape: "fixture", category: "counter", label: "Counter", x: 90, y: 62, width: 60, depth: 24, rotation: 0 });
  });

  it("turns fixtures on side walls so their width runs along the wall", () => {
    const p = buildProposal(raw([{ kind: "toilet", against: "left", box: { x0: 27, y0: 40, x1: 37, y1: 70 } }]), 2, plan(), 1);
    expect(p.fixtures[0]).toMatchObject({ category: "toilet", x: 60, y: 110, width: 60, depth: 20, rotation: 270 });
  });

  it("leaves islands where they are", () => {
    const p = buildProposal(raw([{ kind: "island", against: "none", box: { x0: 50, y0: 45, x1: 70, y1: 55 } }]), 2, plan(), 1);
    expect(p.fixtures[0]).toMatchObject({ x: 120, y: 100, width: 40, depth: 20, rotation: 0 });
  });
});

describe("wall scan without arcs", () => {
  it("adds an unreported window in an exterior wall and a sliding door in an interior wall", () => {
    const m = plan();
    // A closet-style sliding door: gap in the shared wall at y 120–145 with one thin track line.
    for (let y = 120; y <= 145; y++) for (let x = 200; x <= 205; x++) m.data[y * m.w + x] = x === 202 ? 1 : 0;
    const raw: RawDetection = {
      rooms: [
        { name: "A", type: "bedroom", polygon: [{ x: 27, y: 28 }, { x: 99, y: 27 }, { x: 99, y: 74 }, { x: 26, y: 74 }], labeledWidthIn: null, labeledDepthIn: null },
        { name: "B", type: "closet", polygon: [{ x: 104, y: 26 }, { x: 174, y: 26 }, { x: 175, y: 74 }, { x: 104, y: 75 }], labeledWidthIn: null, labeledDepthIn: null },
      ],
      doors: [], windows: [], fixtures: [], dimensionLines: [], notes: "",
    };
    const p = buildProposal(raw, 2, m, 1, m);
    // The window in A's top wall (x 100–140) is the only exterior gap with lines in it.
    expect(p.addedWindows).toBe(1);
    expect(p.openings.find((o) => o.shape === "window")).toMatchObject({ x: 120.5, rotation: 0 });
    // The doorway at y 80–110 (no arc, clear) is an opening; y 120–145 (track line) is a sliding door.
    const others = p.openings.filter((o) => o.shape === "opening").map((o) => [o.label, o.y]);
    expect(others).toEqual(expect.arrayContaining([["Opening", 95.5], ["Sliding door", 133]]));
  });
});

describe("closet sliding doors", () => {
  it("turns an open closet front with a track line into a wall with a sliding door", () => {
    const m = plan();
    // Replace the shared wall between A and closet B with a sliding door: one thin line, short stubs.
    for (let y = 56; y <= 144; y++) for (let x = 200; x <= 205; x++) m.data[y * m.w + x] = x === 202 ? 1 : 0;
    const raw: RawDetection = {
      rooms: [
        { name: "A", type: "bedroom", polygon: [{ x: 27, y: 28 }, { x: 99, y: 27 }, { x: 99, y: 74 }, { x: 26, y: 74 }], labeledWidthIn: null, labeledDepthIn: null },
        { name: "Closet", type: "closet", polygon: [{ x: 104, y: 26 }, { x: 174, y: 26 }, { x: 175, y: 74 }, { x: 104, y: 75 }], labeledWidthIn: null, labeledDepthIn: null },
      ],
      doors: [], windows: [], fixtures: [], dimensionLines: [], notes: "",
    };
    const p = buildProposal(raw, 2, m, 1, m);
    const closet = p.rooms[1];
    expect(closet.walls![3]).toBe(6); // left edge is a wall again
    expect(p.rooms[0].walls![1]).toBe(6); // and so is the bedroom's matching edge
    expect(p.openings.find((o) => o.label === "Sliding door")).toMatchObject({ shape: "opening", x: 202, rotation: 90 });
  });
});

describe("snapping never collapses a room", () => {
  it("ignores a wall that would pull a shallow closet's front past its back", () => {
    // A 400×300 plan with one shallow closet (interior y 100–130) whose front at y≈100 has
    // only a faint track line, and a solid wall right behind its back (y 130–135).
    const w = 400, h = 300, data = new Uint8Array(w * h);
    const fill = (x0: number, y0: number, x1: number, y1: number) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[y * w + x] = 1;
    };
    fill(100, 130, 300, 135); // back wall
    fill(94, 94, 99, 135); fill(301, 94, 306, 135); // side walls
    const rough = [{ x: 102, y: 106 }, { x: 298, y: 106 }, { x: 298, y: 128 }, { x: 102, y: 128 }];
    const edges = snapRoomEdges(rough, { w, h, data }, defaultOpts({ w, h, data }));
    expect(edges[0].wall).toBeNull(); // front stays open instead of jumping to the back wall
    const poly = polygonFromEdges(rough, edges);
    expect(poly[0].y).toBe(106);
    expect(poly[2].y).toBe(130);
  });
});
