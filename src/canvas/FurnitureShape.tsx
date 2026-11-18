import type Konva from "konva";
import { memo } from "react";
import { Arc, Ellipse, Group, Line, Rect, Text } from "react-konva";
import type { Item } from "../../shared/schemas";
import { openingKind, STATUS_COLORS } from "../catalog/furniture";
import { FixtureSymbol } from "./FixtureSymbol";
import { armDepth, outlineLocal, snap } from "../model/geometry";
import { formatDims, type UnitSystem } from "../model/units";
import { PLAN } from "./theme";

interface Props {
  item: Item;
  ppi: number;
  stageScale: number;
  units: UnitSystem;
  selected: boolean;
  issue: "error" | "warning" | null;
  draggable: boolean;
  /** Clean view: draw openings as gaps in the wall, like a finished floor plan. */
  clean?: boolean;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<Item>) => void;
}

/** Outline in canvas pixels for L/U shapes. */
function outlinePx(item: Item, ppi: number): number[] {
  return outlineLocal(item.shape, item.width, item.depth).flatMap((p) => [p.x * ppi, p.y * ppi]);
}

function FurnitureShapeInner({ item, ppi, stageScale, units, selected, issue, draggable, clean, onSelect, onChange }: Props) {
  const w = item.width * ppi;
  const d = item.depth * ppi;
  const colors = STATUS_COLORS[item.status];
  const stroke = issue === "error" ? PLAN.brick : issue === "warning" ? PLAN.honeyInk : selected ? PLAN.lake : colors.stroke;
  const strokeWidth = (selected || issue ? 2.5 : 1.5) / stageScale;
  const dash = issue === "warning" ? [6 / stageScale, 4 / stageScale] : undefined;
  const fill = item.category === "rug" ? "rgba(233,205,178,0.45)" : colors.fill;

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    const free = e.evt.altKey;
    const x = e.target.x() / ppi, y = e.target.y() / ppi;
    onChange(item.id, { x: free ? x : snap(x, 1), y: free ? y : snap(y, 1) });
  };

  const handleTransformEnd = (e: Konva.KonvaEventObject<Event>) => {
    const node = e.target;
    const sx = node.scaleX(), sy = node.scaleY();
    node.scale({ x: 1, y: 1 });
    const fixedDepth = item.shape === "door" || item.shape === "window" || item.shape === "opening";
    onChange(item.id, {
      x: node.x() / ppi,
      y: node.y() / ppi,
      rotation: ((node.rotation() % 360) + 360) % 360,
      width: Math.max(2, snap(item.width * Math.abs(sx), 0.5)),
      depth: fixedDepth ? item.depth : Math.max(2, snap(item.depth * Math.abs(sy), 0.5)),
    });
  };

  const fontSize = 11 / stageScale;
  const turn = ((item.rotation % 360) + 360) % 360;
  const upsideDown = turn > 90 && turn < 270;
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
    case "door": {
      // Leaf drawn open at 90°, hinged at the left end (right if flipped), swinging toward the front.
      const hx = item.flip ? w / 2 : -w / 2;
      const ink = clean && !selected && !issue ? PLAN.wall : stroke;
      if (item.category === "double door") {
        // Two leaves, hinged at either end, meeting in the middle.
        const r = w / 2;
        body = (
          <>
            <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#fff"
              stroke={clean && !selected && !issue ? undefined : stroke} strokeWidth={strokeWidth} />
            <Line points={[-w / 2, d / 2, -w / 2, d / 2 + r]} stroke={ink} strokeWidth={strokeWidth * 1.4} />
            <Line points={[w / 2, d / 2, w / 2, d / 2 + r]} stroke={ink} strokeWidth={strokeWidth * 1.4} />
            <Arc x={-w / 2} y={d / 2} innerRadius={r} outerRadius={r} angle={90} rotation={0}
              stroke={ink} strokeWidth={strokeWidth * 0.8} dash={clean ? undefined : [4 / stageScale, 3 / stageScale]} />
            <Arc x={w / 2} y={d / 2} innerRadius={r} outerRadius={r} angle={90} rotation={90}
              stroke={ink} strokeWidth={strokeWidth * 0.8} dash={clean ? undefined : [4 / stageScale, 3 / stageScale]} />
            <Rect x={-w / 2} y={-d / 2} width={w} height={d + r} fill="transparent" />
          </>
        );
        break;
      }
      body = (
        <>
          <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#fff"
            stroke={clean && !selected && !issue ? undefined : stroke} strokeWidth={strokeWidth} />
          <Line points={[hx, d / 2, hx, d / 2 + w]} stroke={ink} strokeWidth={strokeWidth * 1.4} />
          <Arc x={hx} y={d / 2} innerRadius={w} outerRadius={w} angle={90} rotation={item.flip ? 90 : 0}
            stroke={ink} strokeWidth={strokeWidth * 0.8} dash={clean ? undefined : [4 / stageScale, 3 / stageScale]} />
          <Rect x={-w / 2} y={-d / 2} width={w} height={d + w} fill="transparent" />
        </>
      );
      break;
    }
    case "window":
      body = clean ? (
        <>
          <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#fff" />
          <Line points={[-w / 2, -d / 2, w / 2, -d / 2]} stroke={selected || issue ? stroke : PLAN.wall} strokeWidth={1.2 / stageScale} />
          <Line points={[-w / 2, d / 2, w / 2, d / 2]} stroke={selected || issue ? stroke : PLAN.wall} strokeWidth={1.2 / stageScale} />
          <Line points={[-w / 2, 0, w / 2, 0]} stroke="#7a8a99" strokeWidth={1 / stageScale} />
          {selected && <Rect x={-w / 2} y={-d / 2} width={w} height={d} stroke={stroke} strokeWidth={strokeWidth} />}
        </>
      ) : (
        <>
          <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#e0f2fe" stroke={stroke} strokeWidth={strokeWidth} />
          <Line points={[-w / 2, 0, w / 2, 0]} stroke={stroke} strokeWidth={strokeWidth * 0.7} />
        </>
      );
      break;
    case "opening": {
      const kind = openingKind(item);
      const ink = clean && !selected && !issue ? PLAN.wall : stroke;
      const lw = 1.3 / stageScale;
      // The gap in the wall, then the door's symbol inside it.
      const gap = clean ? (
        <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill="#fff" stroke={selected || issue ? stroke : undefined} strokeWidth={strokeWidth} />
      ) : (
        <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill="rgba(255,255,255,0.6)" stroke={stroke} strokeWidth={strokeWidth}
          dash={[3 / stageScale, 3 / stageScale]} />
      );
      let symbol: React.ReactNode = null;
      if (kind === "sliding door") {
        // Two panels on parallel tracks, overlapping in the middle.
        const t = Math.max(d / 5, 1.5 / stageScale);
        symbol = (
          <>
            <Rect x={-w / 2} y={-d / 4 - t / 2} width={w * 0.55} height={t} stroke={ink} strokeWidth={lw} />
            <Rect x={w / 2 - w * 0.55} y={d / 4 - t / 2} width={w * 0.55} height={t} stroke={ink} strokeWidth={lw} />
          </>
        );
      } else if (kind === "pocket door") {
        // A panel across the opening that slides away into the wall (dashed, inside the wall).
        symbol = (
          <>
            <Line points={[-w / 2, 0, w / 2, 0]} stroke={ink} strokeWidth={lw * 1.4} />
            <Line points={[w / 2, 0, w * 1.4, 0]} stroke={ink} strokeWidth={lw} dash={[4 / stageScale, 3 / stageScale]} />
          </>
        );
      } else if (kind === "bifold door") {
        // Folding panels, drawn as a zigzag on the front side.
        const leaf = w / 4, out = Math.min(leaf * 0.6, w * 0.2);
        const pts = [-w / 2, d / 2, -w / 2 + leaf, d / 2 + out, -w / 2 + 2 * leaf, d / 2, w / 2 - leaf, d / 2 + out, w / 2, d / 2];
        symbol = <Line points={pts} stroke={ink} strokeWidth={lw * 1.2} lineJoin="round" />;
      } else if (kind === "garage door") {
        // Overhead door: a dashed line where the door sits.
        symbol = <Line points={[-w / 2, 0, w / 2, 0]} stroke={ink} strokeWidth={lw * 1.4} dash={[8 / stageScale, 5 / stageScale]} />;
      }
      body = <>{gap}{symbol}</>;
      break;
    }
    case "fixture":
      body = (
        <FixtureSymbol kind={item.category} w={w} d={d} s={stageScale} clean={!!clean}
          stroke={selected || issue ? stroke : clean ? PLAN.wall : PLAN.inkMuted} />
      );
      break;
    default:
      if (item.shape === "rect" && (item.category === "car" || item.category === "truck")) {
        // Seen from above, front (hood) toward +y: rounded body, windshield, roof, rear window;
        // a truck has a cab up front and an open bed behind.
        const lw = 1 / stageScale;
        const inset = w * 0.1;
        const truck = item.category === "truck";
        const shield = d / 2 - d * (truck ? 0.3 : 0.32); // where the windshield meets the hood
        const roofBack = truck ? shield - d * 0.2 : -d / 2 + d * 0.22;
        body = (
          <>
            <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
              dash={dash} cornerRadius={Math.min(w, d) * 0.22} />
            {/* windshield and roof */}
            <Line points={[-w / 2 + inset, shield, w / 2 - inset, shield, w / 2 - inset * 1.4, shield - d * 0.07, -w / 2 + inset * 1.4, shield - d * 0.07]}
              closed stroke={stroke} strokeWidth={lw} opacity={0.8} />
            <Rect x={-w / 2 + inset * 1.4} y={roofBack} width={w - inset * 2.8} height={shield - d * 0.07 - roofBack}
              stroke={stroke} strokeWidth={lw} opacity={0.6} cornerRadius={inset * 0.6} />
            {truck ? (
              // the bed
              <Rect x={-w / 2 + inset * 0.8} y={-d / 2 + inset * 0.8} width={w - inset * 1.6} height={roofBack - (-d / 2 + inset * 0.8) - d * 0.03}
                stroke={stroke} strokeWidth={lw} opacity={0.8} cornerRadius={inset * 0.3} />
            ) : (
              // rear window
              <Line points={[-w / 2 + inset * 1.4, roofBack, w / 2 - inset * 1.4, roofBack, w / 2 - inset, roofBack - d * 0.05, -w / 2 + inset, roofBack - d * 0.05]}
                closed stroke={stroke} strokeWidth={lw} opacity={0.8} />
            )}
          </>
        );
        break;
      }
      body = (
        <Rect x={-w / 2} y={-d / 2} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={strokeWidth}
          dash={dash} cornerRadius={item.category === "rug" ? 0 : 1.5 / stageScale} />
      );
  }
  const builtIn = item.shape === "door" || item.shape === "window" || item.shape === "opening" || item.shape === "fixture";

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
      {item.color && !builtIn && (
        <Rect x={w / 2 - 9 / stageScale} y={-d / 2 + 3 / stageScale} width={6 / stageScale} height={6 / stageScale}
          fill={item.color} stroke="#0003" strokeWidth={0.5 / stageScale} listening={false} />
      )}
      {showLabel && !builtIn && (
        // Turned more than a quarter turn, the label spins back so it never reads upside down
        // (it covers the same area of the piece either way).
        <Group rotation={upsideDown ? 180 : 0} listening={false}>
        <Text
          text={`${name}\n${formatDims(item.width, item.depth, units)}`}
          x={-w / 2}
          y={upsideDown ? d / 2 - labelH : -d / 2}
          width={w}
          height={labelH}
          align="center"
          verticalAlign="middle"
          fontSize={fontSize}
          lineHeight={1.25}
          fill={PLAN.ink}
          fontFamily={PLAN.font}
          listening={false}
          wrap="char"
          ellipsis
        />
        </Group>
      )}
    </Group>
  );
}

export const FurnitureShape = memo(FurnitureShapeInner);
