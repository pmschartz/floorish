import type Konva from "konva";
import { memo } from "react";
import { Arc, Ellipse, Group, Line, Rect, Text } from "react-konva";
import type { Item } from "../../shared/schemas";
import { STATUS_COLORS } from "../catalog/furniture";
import { armDepth, outlineLocal, snap } from "../model/geometry";
import { formatDims, type UnitSystem } from "../model/units";

interface Props {
  item: Item;
  ppi: number;
  stageScale: number;
  units: UnitSystem;
  selected: boolean;
  issue: "error" | "warning" | null;
  draggable: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Item>) => void;
}

/** Outline in canvas pixels for L/U shapes. */
function outlinePx(item: Item, ppi: number): number[] {
  return outlineLocal(item.shape, item.width, item.depth).flatMap((p) => [p.x * ppi, p.y * ppi]);
}

function FurnitureShapeInner({ item, ppi, stageScale, units, selected, issue, draggable, onSelect, onChange }: Props) {
  const w = item.width * ppi;
  const d = item.depth * ppi;
  const colors = STATUS_COLORS[item.status];
  const stroke = issue === "error" ? "#dc2626" : issue === "warning" ? "#ea580c" : selected ? "#111827" : colors.stroke;
  const strokeWidth = (selected || issue ? 2.5 : 1.5) / stageScale;
  const dash = issue === "warning" ? [6 / stageScale, 4 / stageScale] : undefined;
  const fill = item.category === "rug" ? "rgba(168,85,247,0.12)" : colors.fill;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const free = e.evt.altKey;
    const x = e.target.x() / ppi, y = e.target.y() / ppi;
    onChange(item.id, { x: free ? x : snap(x, 1), y: free ? y : snap(y, 1) });
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const sx = node.scaleX(), sy = node.scaleY();
    node.scale({ x: 1, y: 1 });
    const fixedDepth = item.shape === "door" || item.shape === "window";
    onChange(item.id, {
      x: node.x() / ppi,
      y: node.y() / ppi,
      rotation: ((node.rotation() % 360) + 360) % 360,
      width: Math.max(2, snap(item.width * Math.abs(sx), 0.5)),
      depth: fixedDepth ? item.depth : Math.max(2, snap(item.depth * Math.abs(sy), 0.5)),
    });
  };

  const fontSize = 11 / stageScale;
  // L/U shapes have an open middle, so the label goes in the back run of seats.
  const labelH = item.shape === "L" || item.shape === "U" ? armDepth(item.shape, item.width, item.depth) * ppi : d;
  const showLabel = Math.min(w, labelH) * stageScale > 22;
  const name = item.label || item.category || "Unlabeled";

  let body: React.ReactNode;
  switch (item.shape) {
    case "circle":
      body = <Ellipse radiusX={w / 2} radiusY={d / 2} fill={fill} stroke={stroke} strokeWidth={strokeWidth} dash={dash} />;
      break;
    case "L":
    case "U":
      body = <Line points={outlinePx(item, ppi)} closed fill={fill} stroke={stroke} strokeWidth={strokeWidth} dash={dash} />;
      break;
    case "door":
      body = (
        <>
          <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#fff" stroke={stroke} strokeWidth={strokeWidth} />
          {/* leaf drawn open at 90°, hinged at the left, swinging toward the front */}
          <Line points={[-w / 2, d / 2, -w / 2, d / 2 + w]} stroke={stroke} strokeWidth={strokeWidth * 1.4} />
          <Arc x={-w / 2} y={d / 2} innerRadius={w} outerRadius={w} angle={90} rotation={0}
            stroke={stroke} strokeWidth={strokeWidth * 0.8} dash={[4 / stageScale, 3 / stageScale]} />
          <Rect x={-w / 2} y={-d / 2} width={w} height={d + w} fill="transparent" />
        </>
      );
      break;
    case "window":
      body = (
        <>
          <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#e0f2fe" stroke={stroke} strokeWidth={strokeWidth} />
          <Line points={[-w / 2, 0, w / 2, 0]} stroke={stroke} strokeWidth={strokeWidth * 0.7} />
        </>
      );
      break;
    default:
      body = (
        <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
          dash={dash} cornerRadius={item.category === "rug" ? 0 : 1.5 / stageScale} />
      );
  }

  return (
    <Group
      id={`item-${item.id}`}
      name="item"
      x={item.x * ppi}
      y={item.y * ppi}
      rotation={item.rotation}
      draggable={draggable}
      onMouseDown={(e) => {
        e.cancelBubble = true;
        onSelect(item.id);
      }}
      onTap={() => onSelect(item.id)}
      onDragStart={() => onSelect(item.id)}
      onDragEnd={handleDragEnd}
      onTransformEnd={handleTransformEnd}
    >
      {body}
      {item.color && item.shape !== "door" && item.shape !== "window" && (
        <Rect x={w / 2 - 9 / stageScale} y={-d / 2 + 3 / stageScale} width={6 / stageScale} height={6 / stageScale}
          fill={item.color} stroke="#0003" strokeWidth={0.5 / stageScale} listening={false} />
      )}
      {showLabel && item.shape !== "door" && item.shape !== "window" && (
        <Text
          text={`${name}\n${formatDims(item.width, item.depth, units)}`}
          x={-w / 2}
          y={-d / 2}
          width={w}
          height={labelH}
          align="center"
          verticalAlign="middle"
          fontSize={fontSize}
          lineHeight={1.25}
          fill="#1f2937"
          listening={false}
          wrap="char"
          ellipsis
        />
      )}
    </Group>
  );
}

export const FurnitureShape = memo(FurnitureShapeInner);
