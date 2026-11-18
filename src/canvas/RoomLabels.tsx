import { useMemo } from "react";
import { Circle, Group, Rect, Text } from "react-konva";
import { entryHex } from "../../shared/sw";
import type { Item, Room } from "../../shared/schemas";
import { PASSIVE_CATEGORIES } from "../catalog/furniture";
import { bbox, itemCorners, polygonArea } from "../model/geometry";
import { placeLabel } from "../model/labels";
import { formatArea, formatLength, type UnitSystem } from "../model/units";
import { PLAN } from "./theme";

const HUES = [210, 150, 30, 280, 0, 180, 60, 330];

const NAME_PX = 13, DIMS_PX = 11, PAD_PX = 5, DOT_PX = 11, DOT_GAP = 5;
/** Rough text width in screen px, good enough for placing (Figtree; Plex Mono for dimensions). */
const textW = (s: string, px: number, bold = false) => s.length * px * (bold ? 0.6 : 0.55);
const monoW = (s: string, px: number) => s.length * px * 0.62;

/**
 * Room names drawn above everything on a small translucent pill, the same size at any zoom,
 * placed where they cover the least furniture. They move when furniture moves.
 */
export function RoomLabels({ rooms, items, ppi, stageScale, units, clean, selectedRoomId }: {
  rooms: Room[];
  items: Item[];
  ppi: number;
  stageScale: number;
  units: UnitSystem;
  clean: boolean;
  selectedRoomId: string | null;
}) {
  const obstacles = useMemo(
    () =>
      items
        .filter((i) => !PASSIVE_CATEGORIES.has(i.category) && i.shape !== "door" && i.shape !== "window" && i.shape !== "opening")
        .map(itemCorners),
    [items],
  );

  const labels = useMemo(() => {
    const pxToIn = 1 / (ppi * stageScale); // screen px → plan inches
    return rooms.map((room, idx) => {
      const b = bbox(room.polygon);
      const dot = room.paint?.walls ? DOT_PX + DOT_GAP : 0; // wall-color swatch before the name
      const dims = clean
        ? `${formatLength(b.width, units)} × ${formatLength(b.height, units)}`
        : `${formatArea(polygonArea(room.polygon), units)} · ${formatLength(b.width, units)} × ${formatLength(b.height, units)}`;
      const full = {
        w: Math.max(textW(room.name, NAME_PX, true), monoW(dims, DIMS_PX)) + PAD_PX * 2 + dot,
        h: NAME_PX + DIMS_PX + PAD_PX * 2 + 3,
      };
      let showDims = true;
      let placed = placeLabel(room.polygon, obstacles, full.w * pxToIn, full.h * pxToIn);
      let size = full;
      if (!placed.fits) {
        // Too small at this zoom for two lines: just the name.
        showDims = false;
        size = { w: textW(room.name, NAME_PX, true) + PAD_PX * 2 + dot, h: NAME_PX + PAD_PX * 2 };
        placed = placeLabel(room.polygon, obstacles, size.w * pxToIn, size.h * pxToIn);
      }
      return { room, idx, dims, showDims, size, dot, at: placed.at, fits: placed.fits };
    });
  }, [rooms, obstacles, ppi, stageScale, units, clean]);

  const s = stageScale;
  return (
    <Group listening={false}>
      {labels.map(({ room, idx, dims, showDims, size, dot, at, fits }) => {
        const hue = HUES[idx % HUES.length];
        const selected = room.id === selectedRoomId;
        const w = size.w / s, h = size.h / s;
        const x = at.x * ppi - w / 2, y = at.y * ppi - h / 2;
        const ink = clean ? PLAN.ink : `hsl(${hue}, 50%, 25%)`;
        return (
          // Rooms too small for even the name fade back so they don't clutter.
          <Group key={room.id} opacity={fits || selected ? 1 : 0.75}>
            <Rect x={x} y={y} width={w} height={h} cornerRadius={h / 2.4}
              fill={clean ? "rgba(255,252,246,0.82)" : "rgba(255,252,246,0.88)"}
              stroke={selected ? PLAN.lake : "rgba(58,40,24,0.10)"} strokeWidth={(selected ? 1.5 : 1) / s}
              shadowColor="#3a2818" shadowOpacity={0.14} shadowBlur={4 / s} shadowOffsetY={1 / s} />
            {dot > 0 && (
              <Circle x={x + (PAD_PX + DOT_PX / 2) / s} y={y + (PAD_PX + NAME_PX / 2) / s} radius={DOT_PX / 2 / s}
                fill={entryHex(room.paint!.walls!)} stroke="rgba(0,0,0,0.25)" strokeWidth={1 / s} />
            )}
            <Text text={room.name} x={x + dot / s} y={y + PAD_PX / s} width={w - dot / s} align="center" fontSize={NAME_PX / s}
              fontStyle="bold" fontFamily={PLAN.font} fill={ink} wrap="none" />
            {showDims && (
              <Text text={dims} x={x + dot / s} y={y + (PAD_PX + NAME_PX + 3) / s} width={w - dot / s} align="center" fontSize={DIMS_PX / s}
                fontFamily={PLAN.mono} fill={clean ? PLAN.inkMuted : ink} wrap="none" />
            )}
          </Group>
        );
      })}
    </Group>
  );
}
