import { Circle, Group, Line, Text } from "react-konva";
import type { Point, Room } from "../../shared/schemas";
import { bbox, centroid, polygonArea } from "../model/geometry";
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
