import { Circle, Group, Line } from "react-konva";
import type { Point, Room } from "../../shared/schemas";
import type { UnitSystem } from "../model/units";
import { paintSegments } from "../model/paint";
import { PLAN } from "./theme";

const HUES = [210, 150, 30, 280, 0, 180, 60, 330];

interface Props {
  rooms: Room[];
  ppi: number;
  stageScale: number;
  units: UnitSystem;
  selectedRoomId: string | null;
  interactive: boolean;
  onSelect: (id: string) => void;
}

export function RoomLayer({ rooms, ppi, stageScale, units, selectedRoomId, interactive, onSelect }: Props) {
  return (
    <>
      {rooms.map((room, idx) => {
        const hue = HUES[idx % HUES.length];
        const pts = room.polygon.flatMap((p) => [p.x * ppi, p.y * ppi]);
        const selected = room.id === selectedRoomId;
        return (
          <Group key={room.id}>
            <Line
              points={pts}
              closed
              fill={`hsla(${hue}, 70%, 55%, ${selected ? 0.16 : 0.08})`}
              stroke={`hsl(${hue}, 60%, ${selected ? 30 : 45}%)`}
              strokeWidth={(selected ? 2.5 : 1.5) / stageScale}
              dash={selected ? undefined : [8 / stageScale, 4 / stageScale]}
              listening={interactive}
              onClick={(e) => {
                if (e.evt.button !== 0) return;
                onSelect(room.id);
              }}
              onTap={() => onSelect(room.id)}
            />
          </Group>
        );
      })}
    </>
  );
}

/** Room floors in clean view, tinted by type (from the current theme). */
const typeFill = (t: Room["type"]) => PLAN.roomFill[t] ?? PLAN.roomFill.other;

/**
 * A room's walls as filled shapes (inches): a band along the outside of each walled edge, with
 * flat ends, plus a corner block where two walls meet at an outside corner. Nothing pokes past a
 * corner or into an open doorway, whatever the thicknesses.
 */
export function roomWalls(room: Room, defaultThickness: number): number[][] {
  const poly = room.polygon;
  const n = poly.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    area += p.x * q.y - q.x * p.y;
  }
  const cw = area >= 0 ? 1 : -1;
  const thick = (i: number) => {
    const t = room.walls ? room.walls[i] : defaultThickness;
    return t == null || t <= 0 ? 0 : t;
  };
  // Outward normal of edge i (away from the room), unit length.
  const normal = (i: number) => {
    const p = poly[i], q = poly[(i + 1) % n];
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    return { x: (cw * (q.y - p.y)) / len, y: (-cw * (q.x - p.x)) / len };
  };
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const t = thick(i);
    const p = poly[i], q = poly[(i + 1) % n];
    if (!t || Math.hypot(q.x - p.x, q.y - p.y) < 0.01) continue;
    const m = normal(i);
    out.push([p.x, p.y, q.x, q.y, q.x + m.x * t, q.y + m.y * t, p.x + m.x * t, p.y + m.y * t]);
  }
  // Outside corners: fill the square between the two walls' ends.
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const t1 = thick(prev), t2 = thick(i);
    if (!t1 || !t2) continue;
    const a = poly[prev], v = poly[i], c = poly[(i + 1) % n];
    const turn = (v.x - a.x) * (c.y - v.y) - (v.y - a.y) * (c.x - v.x);
    if (turn * cw <= 0) continue; // inside (reflex) corner: the bands already overlap there
    const m1 = normal(prev), m2 = normal(i);
    out.push([v.x, v.y, v.x + m1.x * t1, v.y + m1.y * t1, v.x + m1.x * t1 + m2.x * t2, v.y + m1.y * t1 + m2.y * t2, v.x + m2.x * t2, v.y + m2.y * t2]);
  }
  return out;
}

/** Clean view: tinted rooms and solid walls, like a finished floor plan. Labels float above (RoomLabels). */
export function CleanRoomLayer({ rooms, ppi, stageScale, units, selectedRoomId, interactive, onSelect, wallThickness }: Props & { wallThickness: number }) {
  return (
    <>
      {rooms.map((room) => {
        const selected = room.id === selectedRoomId;
        return (
          <Line
            key={`fill-${room.id}`}
            points={room.polygon.flatMap((p) => [p.x * ppi, p.y * ppi])}
            closed
            fill={typeFill(room.type)}
            stroke={selected ? PLAN.lake : undefined}
            strokeWidth={2.5 / stageScale}
            listening={interactive}
            onClick={(e) => {
              if (e.evt.button !== 0) return;
              onSelect(room.id);
            }}
            onTap={() => onSelect(room.id)}
          />
        );
      })}
      {rooms.flatMap((room) =>
        roomWalls(room, wallThickness).map((pts, i) => (
          <Line key={`wall-${room.id}-${i}`} points={pts.map((v) => v * ppi)} closed fill={PLAN.wall} listening={false} />
        )),
      )}
    </>
  );
}

/** In-progress room or calibration line, drawn in image pixels. */
export function DraftPath({ points, hover, closed, stageScale, color }: {
  points: Point[];
  hover: Point | null;
  closed?: boolean;
  stageScale: number;
  color: string;
}) {
  const all = hover ? [...points, hover] : points;
  return (
    <Group listening={false}>
      <Line points={all.flatMap((p) => [p.x, p.y])} closed={closed} stroke={color} strokeWidth={2 / stageScale}
        dash={[6 / stageScale, 4 / stageScale]} fill={closed ? `${color}22` : undefined} />
      {points.map((p, i) => (
        <Circle key={i} x={p.x} y={p.y} radius={(i === 0 ? 5 : 3.5) / stageScale} fill={i === 0 ? color : PLAN.paper}
          stroke={color} strokeWidth={1.5 / stageScale} />
      ))}
    </Group>
  );
}

/** Each room's wall color as a strip along the inside of its walls (accent wall in its own color). */
export function PaintBands({ rooms, ppi, stageScale }: { rooms: Room[]; ppi: number; stageScale: number }) {
  // About 3" wide, but never thinner than 3 screen pixels.
  const band = Math.max(3, 3 / (ppi * stageScale));
  return (
    <>
      {rooms.flatMap((room) =>
        paintSegments(room, band).map((seg, i) => (
          <Line key={`paint-${room.id}-${i}`} points={seg.pts.map((v) => v * ppi)} stroke={seg.color}
            strokeWidth={band * ppi} lineCap="square" listening={false} />
        )),
      )}
    </>
  );
}
