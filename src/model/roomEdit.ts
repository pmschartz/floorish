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

/** Move one straight wall of a room in or out, to `coord` (inches: y for a horizontal wall, x for a vertical one). */
export function moveRoomEdge(plan: Plan, roomId: string, edge: number, coord: number): Plan {
  const rooms = plan.rooms.map((r) => {
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
  // The wall you dragged stays put; a room on the other side moves to keep the wall standard.
  const ri = plan.rooms.findIndex((r) => r.id === roomId);
  return rejoin(plan, rooms, new Set([`${ri}:${edge}`]));
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

/**
 * The outline of two rooms joined into one, including the wall between them. Works on a grid
 * of the rooms' own corner lines, so straight walls stay straight. Null if they don't connect.
 */
export function unionOutline(a: Point[], b: Point[]): Point[] | null {
  const xs = [...new Set([...a, ...b].map((p) => p.x))].sort((p, q) => p - q);
  const ys = [...new Set([...a, ...b].map((p) => p.y))].sort((p, q) => p - q);
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
  const isIn = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && filled[j][i];
  // One connected piece only.
  const cells: Array<[number, number]> = [];
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (filled[j][i]) cells.push([i, j]);
  if (!cells.length) return null;
  const seen = new Set<string>([cells[0].join()]);
  const stack = [cells[0]];
  while (stack.length) {
    const [i, j] = stack.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${i + di},${j + dj}`;
      if (isIn(i + di, j + dj) && !seen.has(k)) { seen.add(k); stack.push([i + di, j + dj]); }
    }
  }
  if (seen.size !== cells.length) return null;

  // Trace the boundary clockwise (on screen): each filled cell's sides that face an empty cell.
  // Directed segments between grid corners, keyed by their start.
  const next = new Map<string, [number, number]>();
  const key = (i: number, j: number) => `${i},${j}`;
  for (const [i, j] of cells) {
    if (!isIn(i, j - 1)) next.set(key(i, j), [i + 1, j]); // top: left → right
    if (!isIn(i + 1, j)) next.set(key(i + 1, j), [i + 1, j + 1]); // right: top → bottom
    if (!isIn(i, j + 1)) next.set(key(i + 1, j + 1), [i, j + 1]); // bottom: right → left
    if (!isIn(i - 1, j)) next.set(key(i, j + 1), [i, j]); // left: bottom → top
  }
  // Start at the top-left-most corner and walk until back (holes are ignored).
  const [si, sj] = cells.reduce((m, c) => (c[1] < m[1] || (c[1] === m[1] && c[0] < m[0]) ? c : m));
  const out: Point[] = [];
  let cur: [number, number] = [si, sj];
  for (let guard = 0; guard < 4 * (W + 1) * (H + 1); guard++) {
    out.push({ x: xs[cur[0]], y: ys[cur[1]] });
    const n = next.get(key(cur[0], cur[1]));
    if (!n) return null;
    cur = n;
    if (cur[0] === si && cur[1] === sj) break;
  }
  return simplifyOutline(out).polygon;
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
  const source = roomEdges([a, b]);
  const walls = polygon.map((p, i) => {
    const q = polygon[(i + 1) % polygon.length];
    const axis = Math.abs(p.y - q.y) < 0.01 ? "h" : "v";
    const coord = axis === "h" ? p.y : p.x;
    const mid = axis === "h" ? (p.x + q.x) / 2 : (p.y + q.y) / 2;
    const e = source.find((s) => s.axis === axis && Math.abs(s.coord - coord) < 0.01 && mid >= s.span[0] - 0.01 && mid <= s.span[1] + 0.01);
    if (!e) return plan.wallThickness;
    const room = e.room === 0 ? a : b;
    return room.walls ? room.walls[e.edge] : plan.wallThickness;
  });
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
