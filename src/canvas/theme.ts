import type { Item, Room } from "../../shared/schemas";

/**
 * Floorish colors for the plan canvas (Konva can't read CSS variables), in Daylight and Evening.
 * Values match the design system's tokens; keep them in step with src/floorish.css.
 */
export type ResolvedTheme = "light" | "dark";

interface CanvasPalette {
  wall: string; // plan-wall
  floor: string; // plan-floor
  paper: string; // surface-raised: behind the plan in clean view
  grid: string; // plan-grid
  gridMajor: string;
  ink: string;
  inkMuted: string;
  moss: string;
  lake: string;
  honey: string;
  honeyInk: string;
  brick: string;
  line: string;
  /** Room floors in clean view, tinted by type. */
  roomFill: Record<Room["type"], string>;
  /** Room name pills. */
  labelBg: string;
  labelBgImage: string;
  labelEdge: string;
  labelShadow: string;
  /** The gap a door or opening leaves in a wall, and window glass. */
  gap: string;
  gapImage: string;
  windowFill: string;
  windowLine: string;
  /** Built-in fixtures (toilets, sinks…). */
  fixtureFill: string;
  fixtureFillImage: string;
  rug: string;
  status: Record<Item["status"], { fill: string; stroke: string }>;
  blockedFill: string;
  /** The drag box for selecting several pieces. */
  selectFill: string;
  okFill: string;
  swatchEdge: string;
  shadow: string;
  font: string;
  mono: string;
}

const font = '"Figtree", system-ui, -apple-system, "Segoe UI", sans-serif';
const mono = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

const LIGHT: CanvasPalette = {
  wall: "#3b2f25", floor: "#fbf6ec", paper: "#fffcf6", grid: "#e9dfcd", gridMajor: "#d9cbb2",
  ink: "#2a2119", inkMuted: "#6b5d4f", moss: "#3e6a4b", lake: "#356b8c", honey: "#e3a935", honeyInk: "#7a5410", brick: "#a63f29", line: "#e4d9c6",
  // Warm tints: walnut for bedrooms, lake for wet rooms, honey for the kitchen, moss for work.
  roomFill: {
    bedroom: "#f2e1d0", bath: "#dde9f0", kitchen: "#f5e9cf", living: "#f6efe3", dining: "#f6efe3", office: "#e3ebdc",
    closet: "#ece5d8", laundry: "#dfe9e9", hall: "#f6efe3", entry: "#f6efe3", garage: "#e9e3d8", other: "#f3ece0",
  },
  labelBg: "rgba(255,252,246,0.82)", labelBgImage: "rgba(255,252,246,0.88)", labelEdge: "rgba(58,40,24,0.10)", labelShadow: "#3a2818",
  gap: "#fffcf6", gapImage: "rgba(255,255,255,0.6)", windowFill: "#e3eef4", windowLine: "#7a8a99",
  fixtureFill: "#fbfaf8", fixtureFillImage: "rgba(255,255,255,0.55)",
  rug: "rgba(233,205,178,0.45)",
  // Stone for what you own, lake for planned, honey for what to buy.
  status: {
    existing: { fill: "rgba(214,205,190,0.6)", stroke: "#8a7a63" },
    planned: { fill: "rgba(53,107,140,0.18)", stroke: "#356b8c" },
    "to-buy": { fill: "rgba(227,169,53,0.30)", stroke: "#a7771a" },
  },
  blockedFill: "rgba(166,63,41,0.12)", selectFill: "rgba(53,107,140,0.10)", okFill: "rgba(62,106,75,0.12)",
  swatchEdge: "rgba(0,0,0,0.25)", shadow: "#000",
  font, mono,
};

// Evening on the canvas: near-neutral charcoal (just a touch warm) so the plan doesn't read brown,
// walls a soft warm grey rather than bright white, and room tints kept faint.
const DARK: CanvasPalette = {
  wall: "#948d84", floor: "#1d1c1a", paper: "#1f1e1c", grid: "#2a2927", gridMajor: "#353431",
  ink: "#ece7e0", inkMuted: "#aaa39a", moss: "#8dbf93", lake: "#8cc1de", honey: "#eabf5f", honeyInk: "#f0cd7c", brick: "#ef8f74", line: "#33312e",
  roomFill: {
    bedroom: "#302a26", bath: "#222c32", kitchen: "#302c22", living: "#282725", dining: "#282725", office: "#242d26",
    closet: "#262523", laundry: "#222d2f", hall: "#282725", entry: "#282725", garage: "#242422", other: "#282725",
  },
  labelBg: "rgba(31,30,28,0.9)", labelBgImage: "rgba(31,30,28,0.92)", labelEdge: "rgba(255,255,255,0.09)", labelShadow: "#000",
  gap: "#1f1e1c", gapImage: "rgba(31,30,28,0.75)", windowFill: "#22282b", windowLine: "#7fa9c0",
  fixtureFill: "#2c2b29", fixtureFillImage: "rgba(31,30,28,0.6)",
  rug: "rgba(110,98,86,0.30)",
  status: {
    existing: { fill: "rgba(120,115,108,0.40)", stroke: "#8f8980" },
    planned: { fill: "rgba(140,193,222,0.16)", stroke: "#7fb3d1" },
    "to-buy": { fill: "rgba(234,191,95,0.20)", stroke: "#d6ae58" },
  },
  blockedFill: "rgba(239,143,116,0.16)", selectFill: "rgba(140,193,222,0.12)", okFill: "rgba(141,191,147,0.16)",
  swatchEdge: "rgba(255,255,255,0.35)", shadow: "#000",
  font, mono,
};

/** The canvas palette for the current theme. Swapped in place by setCanvasTheme; the canvas redraws after. */
export const PLAN: CanvasPalette = { ...LIGHT };

export function setCanvasTheme(theme: ResolvedTheme) {
  Object.assign(PLAN, theme === "dark" ? DARK : LIGHT);
}
