import type Konva from "konva";
import type { Point } from "../../shared/schemas";

/** Lets panels outside the canvas reach the stage (export, add-at-center, zoom to fit). */
export const canvasApi: {
  stage: Konva.Stage | null;
  centerInches: () => Point | null;
  fit: () => void;
  focusItem: (id: string) => void;
} = {
  stage: null,
  centerInches: () => null,
  fit: () => {},
  focusItem: () => {},
};

export const DRAG_MIME = "application/x-house-planner-entry";
