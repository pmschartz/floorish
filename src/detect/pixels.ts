import { maskFromRgba, type Mask } from "./snap";

export const CLAUDE_MAX_SIDE = 2576; // Claude reads images up to this size at full detail

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** The floor plan's wall mask at full resolution, plus a copy sized for Claude. */
export async function preparePlanImage(url: string): Promise<{
  mask: Mask;
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
  const mask = maskFromRgba(fctx.getImageData(0, 0, w, h).data, w, h);

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
    forClaude: { base64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg", width: sw, height: sh },
    factor: w / sw,
  };
}
