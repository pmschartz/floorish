import { maskFromRgba, type Mask } from "./snap";

export const CLAUDE_MAX_SIDE = 2576; // Claude reads images up to this size at full detail

/** Wait for `load` rather than `decode()`: browsers may hold decoding until a hidden page is shown again. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the floor plan image."));
    img.src = url;
  });
}

/** The floor plan's wall mask at full resolution, plus a copy sized for Claude. */
export async function preparePlanImage(url: string): Promise<{
  mask: Mask; // dark strokes: walls
  ink: Mask; // all line work, including thin gray lines like door arcs and fixture outlines
  fill: Mask; // anything that isn't blank paper: wall fills, hatching, tints
  forClaude: { base64: string; mediaType: "image/jpeg"; width: number; height: number };
  factor: number; // original px per sent px
}> {
  const img = await loadImage(url);
  const w = img.naturalWidth, h = img.naturalHeight;

  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  const fctx = full.getContext("2d", { willReadFrequently: true })!;
  fctx.fillStyle = "#fff";
  fctx.fillRect(0, 0, w, h);
  fctx.drawImage(img, 0, 0);
  const rgba = fctx.getImageData(0, 0, w, h).data;
  const mask = maskFromRgba(rgba, w, h);
  // Room tints (peach, blue, beige) sit above ~195 luminance; line work is darker.
  const ink = maskFromRgba(rgba, w, h, 185);
  // Wall fills (gray, yellow, hatching) between a wall's outline lines.
  const fill = maskFromRgba(rgba, w, h, 235);

  const k = Math.min(1, CLAUDE_MAX_SIDE / Math.max(w, h));
  const sw = Math.round(w * k), sh = Math.round(h * k);
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d")!;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(full, 0, 0, sw, sh);
  const dataUrl = small.toDataURL("image/jpeg", 0.92);

  return {
    mask,
    ink,
    fill,
    forClaude: { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg", width: sw, height: sh },
    factor: w / sw,
  };
}
