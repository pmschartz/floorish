import type Konva from "konva";
import { useState } from "react";
import { Group, Line, Rect } from "react-konva";
import type { Point, Room } from "../../shared/schemas";
import { roomEdges } from "../detect/walls";
import { useWallHover } from "../panels/RoomWalls";
import { PLAN } from "./theme";

/** Within this many inches, a dragged wall snaps to another room's wall line. */
const SNAP_IN = 4;

/**
 * Handles on each straight wall of the selected room: drag one in or out to move that wall.
 * It snaps to the line of other rooms' walls nearby (so walls can be lined up by hand) and to
 * half inches otherwise. The outline being dragged shows dashed until you let go.
 */
export function RoomEditHandles({ room, rooms, ppi, stageScale, onMoveEdge }: {
  room: Room;
  rooms: Room[];
  ppi: number;
  stageScale: number;
  onMoveEdge: (edge: number, coord: number) => void;
}) {
  const [drag, setDrag] = useState<{ edge: number; coord: number } | null>(null);
  const hover = useWallHover((h) => (h.roomId === room.id ? h.edge : null));
  const s = stageScale;
  const index = rooms.findIndex((r) => r.id === room.id);
  const mine = roomEdges([room]);
  // Lines other rooms' walls sit on (both faces), to snap to.
  const others = roomEdges(rooms.filter((r) => r.id !== room.id));

  const snap = (axis: "h" | "v", c: number) => {
    let best = Math.round(c * 2) / 2, bestD = SNAP_IN;
    for (const e of others) {
      if (e.axis !== axis) continue;
      const d = Math.abs(e.coord - c);
      if (d < bestD) { best = e.coord; bestD = d; }
    }
    return best;
  };

  const preview: Point[] | null = drag
    ? room.polygon.map((p, i) => {
        const e = mine.find((x) => x.edge === drag.edge)!;
        const n = room.polygon.length;
        if (i !== drag.edge && i !== (drag.edge + 1) % n) return p;
        return e.axis === "h" ? { x: p.x, y: drag.coord } : { x: drag.coord, y: p.y };
      })
    : null;

  const setCursor = (e: Konva.KonvaEventObject<MouseEvent>, c: string) => {
    const el = e.target.getStage()?.container();
    if (el) el.style.cursor = c;
  };

  if (index < 0) return null;
  return (
    <Group>
      {hover != null && hover < room.polygon.length && (
        // The wall hovered in the room panel's list.
        <Line points={[room.polygon[hover].x * ppi, room.polygon[hover].y * ppi, room.polygon[(hover + 1) % room.polygon.length].x * ppi, room.polygon[(hover + 1) % room.polygon.length].y * ppi]}
          stroke={PLAN.honey} strokeWidth={5 / s} lineCap="round" listening={false} />
      )}
      {preview && (
        <Line points={preview.flatMap((p) => [p.x * ppi, p.y * ppi])} closed stroke={PLAN.moss}
          strokeWidth={2 / s} dash={[6 / s, 4 / s]} listening={false} />
      )}
      {mine.map((e) => {
        const len = e.span[1] - e.span[0];
        if (len * ppi * s < 24) return null; // too short to grab at this zoom
        const mid = (e.span[0] + e.span[1]) / 2;
        const coord = drag?.edge === e.edge ? drag.coord : e.coord;
        const long = 28 / s, short = 10 / s;
        const w = e.axis === "h" ? long : short, h = e.axis === "h" ? short : long;
        const cx = (e.axis === "h" ? mid : coord) * ppi, cy = (e.axis === "h" ? coord : mid) * ppi;
        const cursor = e.axis === "h" ? "ns-resize" : "ew-resize";
        return (
          <Rect
            key={e.edge}
            x={cx - w / 2}
            y={cy - h / 2}
            width={w}
            height={h}
            cornerRadius={short / 2}
            fill={PLAN.moss}
            stroke={PLAN.paper}
            strokeWidth={2 / s}
            shadowColor="#000"
            shadowOpacity={0.15}
            shadowBlur={3 / s}
            draggable
            onMouseEnter={(ev) => setCursor(ev, cursor)}
            onMouseLeave={(ev) => setCursor(ev, "default")}
            onMouseDown={(ev) => { ev.cancelBubble = true; }}
            onDragStart={(ev) => { ev.cancelBubble = true; setDrag({ edge: e.edge, coord: e.coord }); }}
            onDragMove={(ev) => {
              ev.cancelBubble = true;
              const node = ev.target;
              // Only across the wall: keep the handle on its line along the wall.
              if (e.axis === "h") node.x(cx - w / 2); else node.y(cy - h / 2);
              const raw = e.axis === "h" ? (node.y() + h / 2) / ppi : (node.x() + w / 2) / ppi;
              setDrag({ edge: e.edge, coord: snap(e.axis, raw) });
            }}
            onDragEnd={(ev) => {
              ev.cancelBubble = true;
              const c = drag?.edge === e.edge ? drag.coord : e.coord;
              setDrag(null);
              if (Math.abs(c - e.coord) >= 0.25) onMoveEdge(e.edge, c);
              else { ev.target.x(cx - w / 2); ev.target.y(cy - h / 2); }
            }}
          />
        );
      })}
    </Group>
  );
}
