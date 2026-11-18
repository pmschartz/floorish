import { Circle, Group, Line } from "react-konva";
import type { Point, Room } from "../../shared/schemas";
import type { UnitSystem } from "../model/units";
import { paintSegments } from "../model/paint";

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

const TYPE_FILL: Record<Room["type"], string> = {
  bedroom: "#f4dcc9",
  bath: "#d6e8ee",
  kitchen: "#efe8dc",
  living: "#f3eee7",
  dining: "#f3eee7",
  office: "#e6ecdc",
  closet: "#ebe7e1",
  laundry: "#d9e9e6",
  hall: "#f3eee7",
  entry: "#f3eee7",
  garage: "#ebe7e0",
  other: "#f0ece6",
};

/** Wall strokes for a room in inches: each edge pushed outward by half its wall's thickness. */
export function roomWalls(room: Room, defaultThickness: number): Array<{ pts: number[]; t: number }> {
  const poly = room.polygon;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    area += p.x * q.y - q.x * p.y;
  }
  const cw = area >= 0 ? 1 : -1;
  const out: Array<{ pts: number[]; t: number }> = [];
  poly.forEach((p, i) => {
    const t = room.walls ? room.walls[i] : defaultThickness;
    if (t == null || t <= 0) return; // open to the next space
    const q = poly[(i + 1) % poly.length];
    const len = Math.hypot(q.x - p.x, q.y - p.y);
    if (len < 0.01) return;
    // Inward normal of a clockwise (on screen) polygon is (−dy, dx); walls sit on the other side.
    const nx = (-cw * -(q.y - p.y)) / len, ny = (-cw * (q.x - p.x)) / len;
    const ox = nx * t / 2, oy = ny * t / 2;
    out.push({ pts: [p.x + ox, p.y + oy, q.x + ox, q.y + oy], t });
  });
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
            fill={TYPE_FILL[room.type] ?? TYPE_FILL.other}
            stroke={selected ? "#2f6f5e" : undefined}
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
        roomWalls(room, wallThickness).map((w, i) => (
          <Line key={`wall-${room.id}-${i}`} points={w.pts.map((v) => v * ppi)} stroke="#2b2b2b"
            strokeWidth={w.t * ppi} lineCap="square" listening={false} />
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
        <Circle key={i} x={p.x} y={p.y} radius={(i === 0 ? 5 : 3.5) / stageScale} fill={i === 0 ? color : "#fff"}
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
