import { Circle, Ellipse, Line, Rect, Text } from "react-konva";

/**
 * Plan symbols for built-in fixtures, drawn in the item's local frame (pixels):
 * width along x, depth along y, the wall at the back (−y) and the front at +y.
 */
export function FixtureSymbol({ kind, w, d, s, stroke, clean }: {
  kind: string;
  w: number;
  d: number;
  s: number; // stage scale, to keep line widths constant on screen
  stroke: string;
  clean: boolean;
}) {
  const sw = 1.2 / s;
  const fill = clean ? "#fbfaf8" : "rgba(255,255,255,0.55)";
  const x0 = -w / 2, y0 = -d / 2;
  const base = <Rect x={x0} y={y0} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} />;
  const m = Math.min(w, d);

  switch (kind) {
    case "toilet": {
      const tankH = d * 0.3;
      return (
        <>
          <Rect x={x0 + w * 0.06} y={y0} width={w * 0.88} height={tankH} fill={fill} stroke={stroke} strokeWidth={sw} cornerRadius={m * 0.06} />
          <Ellipse x={0} y={y0 + tankH + (d - tankH) * 0.5} radiusX={w * 0.4} radiusY={(d - tankH) * 0.48} fill={fill} stroke={stroke} strokeWidth={sw} />
          <Ellipse x={0} y={y0 + tankH + (d - tankH) * 0.52} radiusX={w * 0.25} radiusY={(d - tankH) * 0.3} stroke={stroke} strokeWidth={sw * 0.7} />
        </>
      );
    }
    case "tub":
      return (
        <>
          <Rect x={x0} y={y0} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw} cornerRadius={m * 0.08} />
          <Rect x={x0 + m * 0.1} y={y0 + m * 0.1} width={w - m * 0.2} height={d - m * 0.2} stroke={stroke} strokeWidth={sw * 0.8} cornerRadius={m * 0.3} />
          <Circle x={x0 + w - m * 0.3} y={0} radius={m * 0.05} stroke={stroke} strokeWidth={sw * 0.8} />
        </>
      );
    case "shower":
      return (
        <>
          {base}
          <Line points={[x0, y0, x0 + w, y0 + d]} stroke={stroke} strokeWidth={sw * 0.6} />
          <Line points={[x0 + w, y0, x0, y0 + d]} stroke={stroke} strokeWidth={sw * 0.6} />
          <Circle x={0} y={0} radius={m * 0.05} fill={fill} stroke={stroke} strokeWidth={sw * 0.8} />
        </>
      );
    case "sink":
      return (
        <>
          {base}
          <Rect x={x0 + w * 0.12} y={y0 + d * 0.22} width={w * 0.76} height={d * 0.62} stroke={stroke} strokeWidth={sw * 0.8} cornerRadius={m * 0.15} />
          <Circle x={0} y={y0 + d * 0.12} radius={m * 0.05} stroke={stroke} strokeWidth={sw * 0.8} />
        </>
      );
    case "vanity": {
      const basins = w > d * 2.6 ? [-w / 4, w / 4] : [0];
      return (
        <>
          {base}
          {basins.map((cx) => (
            <Ellipse key={cx} x={cx} y={y0 + d * 0.55} radiusX={Math.min(w / (basins.length * 2), d) * 0.32} radiusY={d * 0.26}
              stroke={stroke} strokeWidth={sw * 0.8} />
          ))}
        </>
      );
    }
    case "range": {
      const r = m * 0.14;
      return (
        <>
          {base}
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => (
            <Circle key={`${i}${j}`} x={i * w * 0.22} y={j * d * 0.22} radius={r} stroke={stroke} strokeWidth={sw * 0.8} />
          ))}
        </>
      );
    }
    case "fridge":
    case "dishwasher": {
      const label = kind === "fridge" ? "REF" : "DW";
      return (
        <>
          {base}
          <Line points={[x0, y0 + d * 0.85, x0 + w, y0 + d * 0.85]} stroke={stroke} strokeWidth={sw * 0.7} />
          <Text text={label} x={x0} y={-6 / s} width={w} align="center" fontSize={Math.min(10 / s, m * 0.35)} fill={stroke} />
        </>
      );
    }
    case "washer":
    case "dryer":
      return (
        <>
          {base}
          <Circle x={0} y={d * 0.05} radius={m * 0.32} stroke={stroke} strokeWidth={sw * 0.8} />
          {kind === "washer" && <Circle x={0} y={d * 0.05} radius={m * 0.12} stroke={stroke} strokeWidth={sw * 0.6} />}
        </>
      );
    case "water heater":
      return <Circle x={0} y={0} radius={m / 2} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "fireplace": {
      const hatch: number[][] = [];
      for (let x = x0 - d; x < x0 + w; x += Math.max(m * 0.35, 4 / s)) {
        const ax = Math.max(x, x0), ay = y0 + (ax - x);
        const bx = Math.min(x + d, x0 + w), by = y0 + (bx - x);
        if (bx > ax) hatch.push([ax, ay, bx, by]);
      }
      return (
        <>
          {base}
          {hatch.map((pts, i) => <Line key={i} points={pts} stroke={stroke} strokeWidth={sw * 0.6} />)}
        </>
      );
    }
    case "stairs": {
      // Treads across the long direction, ~10" apart in a 36"-wide run, with a direction arrow.
      const alongY = d >= w;
      const len = alongY ? d : w;
      const n = Math.max(3, Math.round(len / (Math.min(w, d) * 0.28)));
      const treads = Array.from({ length: n - 1 }, (_, i) => ((i + 1) / n) * len);
      return (
        <>
          {base}
          {treads.map((t, i) =>
            alongY
              ? <Line key={i} points={[x0, y0 + t, x0 + w, y0 + t]} stroke={stroke} strokeWidth={sw * 0.7} />
              : <Line key={i} points={[x0 + t, y0, x0 + t, y0 + d]} stroke={stroke} strokeWidth={sw * 0.7} />,
          )}
          {alongY
            ? <Line points={[0, y0 + d * 0.9, 0, y0 + d * 0.1, -w * 0.12, y0 + d * 0.1 + w * 0.15, 0, y0 + d * 0.1, w * 0.12, y0 + d * 0.1 + w * 0.15]} stroke={stroke} strokeWidth={sw * 0.8} />
            : <Line points={[x0 + w * 0.1, 0, x0 + w * 0.9, 0, x0 + w * 0.9 - d * 0.15, -d * 0.12, x0 + w * 0.9, 0, x0 + w * 0.9 - d * 0.15, d * 0.12]} stroke={stroke} strokeWidth={sw * 0.8} />}
        </>
      );
    }
    case "shelf":
      return (
        <>
          <Rect x={x0} y={y0} width={w} height={d} fill={fill} stroke={stroke} strokeWidth={sw * 0.8} dash={[4 / s, 3 / s]} />
          <Line points={[x0, 0, x0 + w, 0]} stroke={stroke} strokeWidth={sw * 0.5} dash={[3 / s, 3 / s]} />
        </>
      );
    case "counter":
    case "island":
      return (
        <>
          {base}
          {/* upper cabinets / countertop edge */}
          {kind === "counter" && <Line points={[x0, y0 + d * 0.15, x0 + w, y0 + d * 0.15]} stroke={stroke} strokeWidth={sw * 0.5} dash={[4 / s, 3 / s]} />}
        </>
      );
    default:
      return base;
  }
}
