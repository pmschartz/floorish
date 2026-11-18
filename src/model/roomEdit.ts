import type { Plan, Point, Room } from "../../shared/schemas";
import { fitOpeningsToWalls, MAX_WALL_IN, roomEdges, simplifyOutline, standardizeWalls, wallStandard } from "../detect/walls";
import { pointInPolygon } from "./geometry";

/**
 * After changing room outlines: every wall goes back to the plan's standard inside or outside
 * thickness (rooms either side of a wall keep it exactly that thick), and doors and windows
 * re-centre. `pinned` edges ("room index:edge") stay exactly where they are.
 */
function rejoin(plan: Plan, rooms: Room[], pinned?: Set<string>): Plan {
  const { rooms: joined } = standardizeWalls(rooms, wallStandard(plan.rooms), pinned);
  return { ...plan, rooms: joined, items: fitOpeningsToWalls(plan.items, joined, joined.map((r) => r.walls ?? [])) };
}

const polyArea = (pts: Point[]) => pts.reduce((t, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return t + p.x * q.y - q.x * p.y;
}, 0) / 2;

/** Move one straight wall of a room in or out, to `coord` (inches: y for a horizontal wall, x for a vertical one). */
export function moveRoomEdge(plan: Plan, roomId: string, edge: number, coord: number): Plan {
  const ri0 = plan.rooms.findIndex((r) => r.id === roomId);
  const all = roomEdges(plan.rooms);
  const moved = all.find((x) => x.room === ri0 && x.edge === edge);
  // Walls across from this one that lie within it move with it, so the next room grows or shrinks to match.
  const followers = moved ? all.filter((f) => f.room !== ri0 && f.axis === moved.axis && f.inward === -moved.inward &&
    (f.coord - moved.coord) * -moved.inward > -0.5 && (f.coord - moved.coord) * -moved.inward <= MAX_WALL_IN &&
    f.span[0] >= moved.span[0] - 1 && f.span[1] <= moved.span[1] + 1) : [];
  const delta = moved ? coord - moved.coord : 0;
  let rooms = plan.rooms.map((r, ri) => {
    const mine = followers.filter((f) => f.room === ri);
    if (!mine.length || r.id === roomId) return r;
    const poly = r.polygon.map((p) => ({ ...p }));
    for (const f of mine) {
      const p = poly[f.edge], q = poly[(f.edge + 1) % poly.length];
      if (f.axis === "h") { p.y += delta; q.y += delta; } else { p.x += delta; q.x += delta; }
    }
    // Don't turn a room inside out.
    const a0 = polyArea(r.polygon), a1 = polyArea(poly);
    return Math.sign(a0) === Math.sign(a1) && Math.abs(a1) >= MIN_OVERLAP ? { ...r, polygon: poly } : r;
  });
  rooms = rooms.map((r) => {
    if (r.id !== roomId) return r;
    const n = r.polygon.length;
    const e = roomEdges([r]).find((x) => x.edge === edge);
    if (!e) return r;
    const polygon = r.polygon.map((p, i) => {
      if (i !== edge && i !== (edge + 1) % n) return p;
      return e.axis === "h" ? { x: p.x, y: coord } : { x: coord, y: p.y };
    });
    return { ...r, polygon };
  });
  // Pushed into another room: cut it out of that room.
  rooms = carve(plan, rooms, roomId);
  // The wall you dragged stays put; a room on the other side moves to keep the wall standard.
  return rejoin(plan, rooms, new Set([`${ri0}:${edge}`]));
}

/** Rooms that can be merged with this one: touching it, or across a wall from it. */
export function mergeCandidates(plan: Plan, roomId: string): Room[] {
  const i = plan.rooms.findIndex((r) => r.id === roomId);
  if (i < 0) return [];
  const edges = roomEdges(plan.rooms);
  const near = new Set<number>();
  for (const a of edges) {
    if (a.room !== i) continue;
    for (const b of edges) {
      if (b.room === i || b.axis !== a.axis || b.inward !== -a.inward) continue;
      const gap = (b.coord - a.coord) * -a.inward;
      const overlap = Math.min(a.span[1], b.span[1]) - Math.max(a.span[0], b.span[0]);
      if (gap > -0.5 && gap <= MAX_WALL_IN && overlap >= 6) near.add(b.room);
    }
  }
  return [...near].map((k) => plan.rooms[k]);
}

type Cell = [number, number];

/** The filled cells of a grid, split into connected pieces (largest first). */
function pieces(filled: boolean[][]): Cell[][] {
  const H = filled.length, W = H ? filled[0].length : 0;
  const seen = new Set<string>();
  const out: Cell[][] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (!filled[j][i] || seen.has(`${i},${j}`)) continue;
      const piece: Cell[] = [];
      const stack: Cell[] = [[i, j]];
      seen.add(`${i},${j}`);
      while (stack.length) {
        const [a, b] = stack.pop()!;
        piece.push([a, b]);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = a + di, y = b + dj;
          if (x >= 0 && y >= 0 && x < W && y < H && filled[y][x] && !seen.has(`${x},${y}`)) { seen.add(`${x},${y}`); stack.push([x, y]); }
        }
      }
      out.push(piece);
    }
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Trace the outline (clockwise on screen) of a connected set of grid cells. Holes are ignored. */
function traceCells(xs: number[], ys: number[], cells: Cell[]): Point[] | null {
  if (!cells.length) return null;
  const has = new Set(cells.map((c) => c.join()));
  const isIn = (i: number, j: number) => has.has(`${i},${j}`);
  // Directed segments between grid corners, keyed by their start.
  const next = new Map<string, [number, number]>();
  const key = (i: number, j: number) => `${i},${j}`;
  for (const [i, j] of cells) {
    if (!isIn(i, j - 1)) next.set(key(i, j), [i + 1, j]); // top: left → right
    if (!isIn(i + 1, j)) next.set(key(i + 1, j), [i + 1, j + 1]); // right: top → bottom
    if (!isIn(i, j + 1)) next.set(key(i + 1, j + 1), [i, j + 1]); // bottom: right → left
    if (!isIn(i - 1, j)) next.set(key(i, j + 1), [i, j]); // left: bottom → top
  }
  // Start at the top-left-most corner and walk until back.
  const [si, sj] = cells.reduce((m, c) => (c[1] < m[1] || (c[1] === m[1] && c[0] < m[0]) ? c : m));
  const out: Point[] = [];
  let cur: [number, number] = [si, sj];
  for (let guard = 0; guard < 4 * (xs.length + 1) * (ys.length + 1); guard++) {
    out.push({ x: xs[cur[0]], y: ys[cur[1]] });
    const n = next.get(key(cur[0], cur[1]));
    if (!n) return null;
    cur = n;
    if (cur[0] === si && cur[1] === sj) break;
  }
  return simplifyOutline(out).polygon;
}

/** Grid lines: sorted, with lines a hair apart (from slightly-off detected corners) counted as one. */
function gridLines(ns: number[]): number[] {
  const out: number[] = [];
  for (const n of [...ns].sort((p, q) => p - q)) if (!out.length || n - out[out.length - 1] > 0.25) out.push(n);
  return out;
}

/**
 * What's left of room `a` once room `b` and a wall `wall` thick around it are taken out:
 * the biggest piece, its area (sq in), and how much of `a` the two overlapped. Null outline if
 * nothing is left. Only for square-cornered rooms.
 */
export function subtractOutline(a: Point[], b: Point[], wall: number): { polygon: Point[] | null; overlap: number; area: number } {
  const xs = gridLines([...a.map((p) => p.x), ...b.flatMap((p) => [p.x - wall, p.x, p.x + wall])]);
  const ys = gridLines([...a.map((p) => p.y), ...b.flatMap((p) => [p.y - wall, p.y, p.y + wall])]);
  const W = xs.length - 1, H = ys.length - 1;
  const filled: boolean[][] = [];
  let overlap = 0;
  const offsets = [[0, 0], [wall, 0], [-wall, 0], [0, wall], [0, -wall], [wall, wall], [wall, -wall], [-wall, wall], [-wall, -wall]];
  for (let j = 0; j < H; j++) {
    filled.push([]);
    for (let i = 0; i < W; i++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
      const inA = pointInPolygon(c, a, 0);
      // Inside b, or within a wall's thickness of it (square corners).
      const nearB = offsets.some(([dx, dy]) => pointInPolygon({ x: c.x + dx, y: c.y + dy }, b, 0));
      if (inA && pointInPolygon(c, b, 0)) overlap += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      filled[j].push(inA && !nearB);
    }
  }
  const [biggest] = pieces(filled);
  if (!biggest) return { polygon: null, overlap, area: 0 };
  const area = biggest.reduce((t, [i, j]) => t + (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]), 0);
  return { polygon: traceCells(xs, ys, biggest), overlap, area };
}

/**
 * Walls for a new outline: each edge keeps the wall of the original room edge it lies along;
 * anything else (a new edge) gets `fallback`.
 */
function inheritWalls(polygon: Point[], sources: Room[], fallback: number | null): (number | null)[] {
  const source = roomEdges(sources);
  return polygon.map((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    const axis = Math.abs(p.y - q.y) < 0.01 ? "h" : "v";
    const coord = axis === "h" ? p.y : p.x;
    const mid = axis === "h" ? (p.x + q.x) / 2 : (p.y + q.y) / 2;
    const e = source.find((s) => s.axis === axis && Math.abs(s.coord - coord) < 0.01 && mid >= s.span[0] - 0.01 && mid <= s.span[1] + 0.01);
    if (!e) return fallback;
    const room = sources[e.room];
    return room.walls ? room.walls[e.edge] : fallback;
  });
}

/** Rooms overlapping by less than this (sq in) are left to the wall tidy-up. */
const MIN_OVERLAP = 144;

/**
 * Cut room `roomId` out of every room it overlaps, leaving a standard inside wall between them,
 * so a closet drawn inside a bedroom makes the bedroom smaller instead of sitting on top of it.
 * A room that would vanish completely is left as it is.
 */
function carve(plan: Plan, rooms: Room[], roomId: string, only: (r: Room) => boolean = () => true): Room[] {
  const top = rooms.find((r) => r.id === roomId);
  if (!top) return rooms;
  const { interior } = wallStandard(plan.rooms.length ? plan.rooms : rooms);
  return rooms.map((r) => {
    if (r.id === roomId || !only(r)) return r;
    const { polygon, overlap, area } = subtractOutline(r.polygon, top.polygon, interior);
    if (overlap < MIN_OVERLAP || !polygon || area < MIN_OVERLAP) return r;
    return { ...r, polygon, walls: inheritWalls(polygon, [r], interior), suggestions: undefined };
  });
}

/** Add a room to the plan, cutting it out of any rooms it's drawn over. */
export function addRoomCarving(plan: Plan, room: Room): Plan {
  const added = [...plan.rooms, room];
  const rooms = carve(plan, added, room.id);
  if (rooms.every((r, i) => r === added[i])) return { ...plan, rooms };
  const ri = rooms.length - 1;
  // The new room stays exactly where it was drawn; the rooms around it fit to it.
  return rejoin(plan, rooms, new Set(room.polygon.map((_, k) => `${ri}:${k}`)));
}

/**
 * Tidy a plan whose rooms overlap (drawn before rooms were cut out of each other): each smaller
 * room is cut out of the bigger rooms it sits on. Returns the plan unchanged if nothing overlaps.
 */
export function resolveOverlaps(plan: Plan): Plan {
  const size = new Map(plan.rooms.map((r) => [r.id, Math.abs(polyArea(r.polygon))]));
  let rooms = plan.rooms;
  const carvers = new Set<string>();
  for (const small of [...plan.rooms].sort((x, y) => size.get(x.id)! - size.get(y.id)!)) {
    const next = carve(plan, rooms, small.id, (r) => size.get(r.id)! > size.get(small.id)!);
    if (next.some((r, i) => r !== rooms[i])) carvers.add(small.id);
    rooms = next;
  }
  if (!carvers.size) return plan;
  // The smaller rooms stay where they are; the rooms they were cut from fit around them.
  return rejoin(plan, rooms, new Set(rooms.flatMap((r, ri) => (carvers.has(r.id) ? r.polygon.map((_, k) => `${ri}:${k}`) : []))));
}

/** How much wall (inches) a room shares with each room across from it, biggest first. */
export function sharedWalls(plan: Plan, roomId: string): Array<{ room: Room; length: number }> {
  const i = plan.rooms.findIndex((r) => r.id === roomId);
  if (i < 0) return [];
  const edges = roomEdges(plan.rooms);
  const total = new Map<number, number>();
  for (const a of edges) {
    if (a.room !== i) continue;
    for (const b of edges) {
      if (b.room === i || b.axis !== a.axis || b.inward !== -a.inward) continue;
      const gap = (b.coord - a.coord) * -a.inward;
      const overlap = Math.min(a.span[1], b.span[1]) - Math.max(a.span[0], b.span[0]);
      if (gap > -0.5 && gap <= MAX_WALL_IN && overlap >= 6) total.set(b.room, (total.get(b.room) ?? 0) + overlap);
    }
  }
  return [...total].sort((a, b) => b[1] - a[1]).map(([k, length]) => ({ room: plan.rooms[k], length }));
}

/**
 * Remove a room. Its space goes to the room it shares the most wall with (so deleting a closet
 * gives the bedroom its corner back), unless `giveSpace` is false or nothing borders it.
 */
export function removeRoomGivingSpace(plan: Plan, roomId: string, giveSpace = true): Plan {
  const plain = { ...plan, rooms: plan.rooms.filter((r) => r.id !== roomId) };
  if (!giveSpace) return plain;
  for (const { room } of sharedWalls(plan, roomId)) {
    const merged = mergeRooms(plan, room.id, roomId);
    if (merged) return merged;
  }
  return plain;
}

/**
 * The outline of two rooms joined into one, including the wall between them. Works on a grid
 * of the rooms' own corner lines, so straight walls stay straight. Null if they don't connect.
 */
export function unionOutline(a: Point[], b: Point[]): Point[] | null {
  const xs = gridLines([...a, ...b].map((p) => p.x));
  const ys = gridLines([...a, ...b].map((p) => p.y));
  const W = xs.length - 1, H = ys.length - 1;
  const inside: boolean[][] = [];
  for (let j = 0; j < H; j++) {
    inside.push([]);
    for (let i = 0; i < W; i++) {
      const c = { x: (xs[i] + xs[i + 1]) / 2, y: (ys[j] + ys[j + 1]) / 2 };
      inside[j].push(pointInPolygon(c, a, 0) || pointInPolygon(c, b, 0));
    }
  }
  // The wall between the rooms: thin strips with room on both sides become part of the room.
  const filled = inside.map((row) => [...row]);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (inside[j][i]) continue;
      const thinX = xs[i + 1] - xs[i] <= MAX_WALL_IN && i > 0 && i < W - 1 && inside[j][i - 1] && inside[j][i + 1];
      const thinY = ys[j + 1] - ys[j] <= MAX_WALL_IN && j > 0 && j < H - 1 && inside[j - 1][i] && inside[j + 1][i];
      if (thinX || thinY) filled[j][i] = true;
    }
  }
  // One connected piece only.
  const all = pieces(filled);
  if (all.length !== 1) return null;
  return traceCells(xs, ys, all[0]);
}

/**
 * Merge room `otherId` into `roomId`: one room covering both, plus the wall between them. The
 * room keeps its own name, type, paint, versions and chat; the other room is removed. Furniture
 * stays where it is. Null if the rooms don't connect.
 */
export function mergeRooms(plan: Plan, roomId: string, otherId: string): Plan | null {
  const a = plan.rooms.find((r) => r.id === roomId), b = plan.rooms.find((r) => r.id === otherId);
  if (!a || !b || a.id === b.id) return null;
  const polygon = unionOutline(a.polygon, b.polygon);
  if (!polygon) return null;
  // Each new edge keeps the wall of the original edge it lies along, if any.
  const walls = inheritWalls(polygon, [a, b], plan.wallThickness);
  const merged: Room = { ...a, polygon, walls, suggestions: undefined };
  const rooms = plan.rooms.filter((r) => r.id !== b.id).map((r) => (r.id === a.id ? merged : r));
  return rejoin(plan, rooms);
}

/**
 * Put a wall on one edge of a room, or take it away (open to the next room). The room on the
 * other side gets the same; rooms move apart to make room for a new wall, or together when one
 * is taken away.
 */
export function setEdgeWall(plan: Plan, roomId: string, edge: number, wall: boolean): Plan {
  const ri = plan.rooms.findIndex((r) => r.id === roomId);
  if (ri < 0) return plan;
  const edges = roomEdges(plan.rooms);
  const e = edges.find((x) => x.room === ri && x.edge === edge);
  if (!e) return plan;
  const std = wallStandard(plan.rooms);
  // The edges across from this one (touching, or across a wall).
  const across = edges.filter((f) => f.room !== ri && f.axis === e.axis && f.inward === -e.inward &&
    (f.coord - e.coord) * -e.inward > -0.5 && (f.coord - e.coord) * -e.inward <= MAX_WALL_IN &&
    Math.min(e.span[1], f.span[1]) - Math.max(e.span[0], f.span[0]) >= 6);
  const set = new Map<string, number | null>([[`${ri}:${edge}`, wall ? std.interior : null]]);
  for (const f of across) set.set(`${f.room}:${f.edge}`, wall ? std.interior : null);
  let rooms = plan.rooms.map((r, i) => ({
    ...r,
    walls: r.polygon.map((_, k) => (set.has(`${i}:${k}`) ? set.get(`${i}:${k}`)! : r.walls ? r.walls[k] : std.interior)),
  }));
  if (!wall) {
    // Taking a wall away: close the gap so the rooms meet in the middle of where it was.
    const mids = across.map((f) => (e.coord + f.coord) / 2);
    const mid = mids.length ? mids.reduce((a, b) => a + b, 0) / mids.length : e.coord;
    rooms = rooms.map((r, i) => {
      const moves = [{ room: ri, edge }, ...across.map((f) => ({ room: f.room, edge: f.edge }))].filter((m) => m.room === i);
      if (!moves.length) return r;
      const poly = r.polygon.map((p) => ({ ...p }));
      for (const m of moves) {
        const p = poly[m.edge], q = poly[(m.edge + 1) % poly.length];
        if (e.axis === "h") { p.y = mid; q.y = mid; } else { p.x = mid; q.x = mid; }
      }
      return { ...r, polygon: poly };
    });
  }
  return rejoin(plan, rooms);
}
