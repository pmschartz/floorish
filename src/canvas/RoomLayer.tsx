import { Circle, Group, Line, Text } from "react-konva";
import type { Point, Room } from "../../shared/schemas";
import { bbox, centroid, distPointSegment, pointInPolygon, polygonArea } from "../model/geometry";
import { formatArea, formatLength, type UnitSystem } from "../model/units";

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
        const c = centroid(room.polygon);
        const b = bbox(room.polygon);
        const selected = room.id === selectedRoomId;
        const label = `${room.name}\n${formatArea(polygonArea(room.polygon), units)} · ${formatLength(b.width, units)} × ${formatLength(b.height, units)}`;
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
            {/* Label in the room's top-left corner so it stays clear of furniture and printed labels. */}
            <Text
              text={label}
              x={(room.polygon.length === 4 ? b.minX : c.x) * ppi + 6 / stageScale}
              y={(room.polygon.length === 4 ? b.minY : c.y) * ppi + 6 / stageScale}
              width={Math.max(60, b.width * ppi * stageScale - 12) / stageScale}
              fontSize={11 / stageScale}
              lineHeight={1.3}
              padding={3 / stageScale}
              fill={`hsl(${hue}, 50%, 25%)`}
              fontStyle="bold"
              listening={false}
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

/**
 * Where to put a room's label: the center for rectangles; for L-shapes and the like,
 * the point inside the room farthest from its walls (the bounding-box center can land
 * outside the room or on a neighbour).
 */
export function labelPoint(poly: Point[]): Point {
  const b = bbox(poly);
  const center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  if (poly.length <= 4) return center;
  const clearance = (p: Point) =>
    Math.min(...poly.map((a, i) => distPointSegment(p, a, poly[(i + 1) % poly.length])));
  let best = center, bestD = pointInPolygon(center, poly, 0) ? clearance(center) : -1;
  const steps = 24;
  for (let i = 1; i < steps; i++) {
    for (let j = 1; j < steps; j++) {
      const p = { x: b.minX + (b.width * i) / steps, y: b.minY + (b.height * j) / steps };
      if (!pointInPolygon(p, poly, 0)) continue;
      const d = clearance(p);
      if (d > bestD + 0.5) { best = p; bestD = d; }
    }
  }
  return best;
}

/** Clean view: tinted rooms, solid walls, centered labels, like a finished floor plan. */
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
      {rooms.map((room) => {
        const b = bbox(room.polygon);
        const at = labelPoint(room.polygon);
        const cx = at.x * ppi, cy = at.y * ppi;
        const boxW = Math.max(b.width * ppi, 80 / stageScale);
        const small = b.width * ppi * stageScale < 70 || b.height * ppi * stageScale < 40;
        return (
          <Group key={`label-${room.id}`} listening={false}>
            <Text text={room.name} x={cx - boxW / 2} y={cy - (small ? 6 : 12) / stageScale} width={boxW} align="center"
              fontSize={(small ? 10 : 13) / stageScale} fontStyle="bold" fill="#2b2b2b" wrap="none" ellipsis />
            {!small && (
              <Text text={`${formatLength(b.width, units)} × ${formatLength(b.height, units)}`} x={cx - boxW / 2}
                y={cy + 4 / stageScale} width={boxW} align="center" fontSize={11 / stageScale} fill="#55524d" wrap="none" />
            )}
          </Group>
        );
      })}
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
