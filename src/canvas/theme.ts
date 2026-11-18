/**
 * Floorish colors for the plan canvas (Konva can't read CSS variables). Values match the
 * design system's Daylight tokens; keep them in step with src/floorish.css.
 */
export const PLAN = {
  wall: "#3b2f25", // plan-wall
  floor: "#fbf6ec", // plan-floor
  paper: "#fffcf6", // surface-raised: behind the plan in clean view
  grid: "#e9dfcd", // plan-grid
  gridMajor: "#d9cbb2",
  ink: "#2a2119",
  inkMuted: "#6b5d4f",
  moss: "#3e6a4b",
  lake: "#356b8c",
  honey: "#e3a935",
  honeyInk: "#7a5410",
  brick: "#a63f29",
  line: "#e4d9c6",
  font: '"Figtree", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono: '"IBM Plex Mono", ui-monospace, Menlo, monospace',
} as const;
