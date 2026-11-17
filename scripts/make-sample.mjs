// Generates samples/sample-floorplan.svg: a simple 32' × 28' single-floor plan at 3 px per inch.
import fs from "node:fs";

const S = 3, M = 70; // px per inch, margin
const X = (i) => M + i * S;
const W = 384, H = 336; // inches
const rooms = [
  { name: "LIVING", x: 0, y: 0, w: 216, h: 192 },
  { name: "KITCHEN / DINING", x: 216, y: 0, w: 168, h: 192 },
  { name: "BEDROOM", x: 0, y: 192, w: 168, h: 144 },
  { name: "BATH", x: 168, y: 192, w: 96, h: 96 },
  { name: "OFFICE", x: 264, y: 192, w: 120, h: 144 },
  { name: "HALL", x: 168, y: 288, w: 96, h: 48 },
];
const ft = (inches) => `${Math.floor(inches / 12)}'-${inches % 12}"`;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S + 2 * M}" height="${H * S + 2 * M}" viewBox="0 0 ${W * S + 2 * M} ${H * S + 2 * M}">
<rect width="100%" height="100%" fill="#fff"/>
<g font-family="Helvetica, Arial, sans-serif" fill="#222">`;
for (const r of rooms) {
  svg += `<rect x="${X(r.x)}" y="${X(r.y)}" width="${r.w * S}" height="${r.h * S}" fill="none" stroke="#222" stroke-width="5"/>`;
  svg += `<text x="${X(r.x + r.w / 2)}" y="${X(r.y + r.h / 2)}" font-size="20" text-anchor="middle" font-weight="bold">${r.name}</text>`;
  svg += `<text x="${X(r.x + r.w / 2)}" y="${X(r.y + r.h / 2) + 24}" font-size="16" text-anchor="middle">${ft(r.w)} × ${ft(r.h)}</text>`;
}
svg += `<rect x="${X(0)}" y="${X(0)}" width="${W * S}" height="${H * S}" fill="none" stroke="#111" stroke-width="12"/>`;
// Door openings (white gaps + swing arcs)
const doors = [
  { x: 60, y: 192, w: 32, dir: "down" },   // living → bedroom
  { x: 216, y: 230, w: 30, dir: "right", vertical: true }, // hall area → bath (on bath west wall)
  { x: 264, y: 300, w: 30, dir: "right", vertical: true }, // hall → office
  { x: 180, y: 336, w: 36, dir: "up" },    // front door into hall
];
for (const d of doors) {
  if (d.vertical) {
    svg += `<line x1="${X(d.x)}" y1="${X(d.y)}" x2="${X(d.x)}" y2="${X(d.y + d.w)}" stroke="#fff" stroke-width="14"/>`;
    svg += `<path d="M ${X(d.x)} ${X(d.y)} L ${X(d.x + d.w)} ${X(d.y)} A ${d.w * S} ${d.w * S} 0 0 1 ${X(d.x)} ${X(d.y + d.w)}" fill="none" stroke="#666" stroke-width="2"/>`;
  } else {
    svg += `<line x1="${X(d.x)}" y1="${X(d.y)}" x2="${X(d.x + d.w)}" y2="${X(d.y)}" stroke="#fff" stroke-width="14"/>`;
    const sy = d.dir === "down" ? 1 : -1;
    svg += `<path d="M ${X(d.x)} ${X(d.y)} L ${X(d.x)} ${X(d.y + sy * d.w)} A ${d.w * S} ${d.w * S} 0 0 ${sy > 0 ? 0 : 1} ${X(d.x + d.w)} ${X(d.y)}" fill="none" stroke="#666" stroke-width="2"/>`;
  }
}
// Overall dimension lines
const dim = (x1, y1, x2, y2, label, horiz) => {
  svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#c00" stroke-width="1.5"/>`;
  const t = 8;
  svg += horiz
    ? `<line x1="${x1}" y1="${y1 - t}" x2="${x1}" y2="${y1 + t}" stroke="#c00" stroke-width="1.5"/><line x1="${x2}" y1="${y2 - t}" x2="${x2}" y2="${y2 + t}" stroke="#c00" stroke-width="1.5"/>`
    : `<line x1="${x1 - t}" y1="${y1}" x2="${x1 + t}" y2="${y1}" stroke="#c00" stroke-width="1.5"/><line x1="${x2 - t}" y1="${y2}" x2="${x2 + t}" y2="${y2}" stroke="#c00" stroke-width="1.5"/>`;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  svg += horiz
    ? `<text x="${mx}" y="${my - 8}" font-size="18" text-anchor="middle" fill="#c00">${label}</text>`
    : `<text x="${mx - 10}" y="${my}" font-size="18" text-anchor="middle" fill="#c00" transform="rotate(-90 ${mx - 10} ${my})">${label}</text>`;
};
dim(X(0), M - 30, X(W), M - 30, ft(W), true);
dim(M - 30, X(0), M - 30, X(H), ft(H), false);
svg += `<text x="${X(W)}" y="${X(H) + 50}" font-size="14" text-anchor="end" fill="#666">SAMPLE FLOOR PLAN · NOT TO SCALE FOR CONSTRUCTION</text>`;
svg += `</g></svg>`;
fs.mkdirSync("samples", { recursive: true });
fs.writeFileSync("samples/sample-floorplan.svg", svg);
console.log("wrote samples/sample-floorplan.svg");
