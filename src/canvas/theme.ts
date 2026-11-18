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
  blockedFill: "rgba(166,63,41,0.12)", okFill: "rgba(62,106,75,0.12)",
  swatchEdge: "rgba(0,0,0,0.25)", shadow: "#000",
  font, mono,
};

const DARK: CanvasPalette = {
  wall: "#d9cfc2", floor: "#211d19", paper: "#24201b", grid: "#2e2822", gridMajor: "#3d352d",
  ink: "#f3ece2", inkMuted: "#b8ab9b", moss: "#8dbf93", lake: "#8cc1de", honey: "#eabf5f", honeyInk: "#f0cd7c", brick: "#ef8f74", line: "#362f28",
  roomFill: {
    bedroom: "#3a2b20", bath: "#1f3340", kitchen: "#3d3019", living: "#2b2520", dining: "#2b2520", office: "#25372a",
    closet: "#2e2822", laundry: "#21343a", hall: "#2b2520", entry: "#2b2520", garage: "#2a2622", other: "#2b2520",
  },
  labelBg: "rgba(36,32,27,0.88)", labelBgImage: "rgba(36,32,27,0.9)", labelEdge: "rgba(255,255,255,0.10)", labelShadow: "#000",
  gap: "#24201b", gapImage: "rgba(36,32,27,0.7)", windowFill: "#1f3340", windowLine: "#8cc1de",
  fixtureFill: "#2e2822", fixtureFillImage: "rgba(36,32,27,0.6)",
  rug: "rgba(74,58,45,0.55)",
  status: {
    existing: { fill: "rgba(91,84,75,0.65)", stroke: "#a99b88" },
    planned: { fill: "rgba(140,193,222,0.20)", stroke: "#8cc1de" },
    "to-buy": { fill: "rgba(234,191,95,0.26)", stroke: "#eabf5f" },
  },
  blockedFill: "rgba(239,143,116,0.16)", okFill: "rgba(141,191,147,0.16)",
  swatchEdge: "rgba(255,255,255,0.35)", shadow: "#000",
  font, mono,
};

/** The canvas palette for the current theme. Swapped in place by setCanvasTheme; the canvas redraws after. */
export const PLAN: CanvasPalette = { ...LIGHT };

export function setCanvasTheme(theme: ResolvedTheme) {
  Object.assign(PLAN, theme === "dark" ? DARK : LIGHT);
}
