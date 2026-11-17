import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MAX_SIDE = 5000; // keep very large scans manageable in the browser

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode the image"))), type, quality),
  );
}

async function fromPdf(file: File): Promise<PreparedImage> {
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(MAX_SIDE / Math.max(base.width, base.height), 4);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(vp.width);
  canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
  await task.destroy();
  return { blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height };
}

async function fromImage(file: File): Promise<PreparedImage> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const supported = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
  if (k === 1 && supported) {
    const out = { blob: file as Blob, width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return { blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height };
}

/** SVGs are rasterized at a size that keeps lines crisp when zoomed in. */
async function fromSvg(file: File): Promise<PreparedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't read that SVG."));
      img.src = url;
    });
    const w0 = img.naturalWidth || 1200, h0 = img.naturalHeight || 900;
    const k = Math.min(MAX_SIDE / Math.max(w0, h0), 2);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w0 * k);
    canvas.height = Math.round(h0 * k);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { blob: await canvasToBlob(canvas), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Turn an uploaded PNG/JPG/WebP/SVG/PDF into an image the canvas can use. PDFs use page 1. */
export function prepareFloorPlan(file: File): Promise<PreparedImage> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) return fromPdf(file);
  if (file.type === "image/svg+xml" || file.name.toLowerCase().endsWith(".svg")) return fromSvg(file);
  if (file.type.startsWith("image/")) return fromImage(file);
  return Promise.reject(new Error("Use a PNG, JPG, WebP, SVG, or PDF file."));
}
