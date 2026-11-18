/**
 * Sherwin-Williams paint colors. Palette entries are stored as SW references ("SW 7008");
 * hex is only used to draw swatches and to find the nearest SW color.
 * Data: Sherwin-Williams' public color list (current, non-archived colors), saved in swColors.json.
 */
import raw from "./swColors.json";

export interface SwColor {
  number: string; // "7008"
  name: string; // "Alabaster"
  hex: string; // "#edeae0"
  family: string; // "Neutral", "Blue"… (blank when SW doesn't say)
  lrv: number; // light reflectance value, 0–100
}

export const SW_COLORS: SwColor[] = (raw as Array<[string, string, string, string, number]>).map(
  ([number, name, hex, family, lrv]) => ({ number, name, hex, family, lrv }),
);

const byNumber = new Map(SW_COLORS.map((c) => [c.number, c]));
const byName = new Map(SW_COLORS.map((c) => [c.name.toLowerCase(), c]));

/** "SW 7008" */
export const swRef = (c: SwColor) => `SW ${c.number}`;
/** "SW 7008 Alabaster" */
export const swLabel = (c: SwColor) => `SW ${c.number} ${c.name}`;

/** Find a color from "SW 7008", "sw7008", "7008", "Alabaster" or "SW 7008 Alabaster". */
export function findSw(ref: string): SwColor | undefined {
  const s = ref.trim();
  const num = s.match(/^(?:sw\s*)?(\d{4})\b/i);
  if (num) return byNumber.get(num[1]);
  return byName.get(s.toLowerCase());
}

/** Lowercase without accents, so "rojo marron" finds "Rojo Marrón". */
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** Search by number or name; numbers first, then names that start with the text, then the rest. */
export function searchSw(query: string, limit = 24): SwColor[] {
  const q = plain(query).replace(/^sw\s*/, "");
  if (!q) return [];
  const starts: SwColor[] = [], contains: SwColor[] = [];
  for (const c of SW_COLORS) {
    const name = plain(c.name);
    if (c.number.startsWith(q) || name.startsWith(q)) starts.push(c);
    else if (name.includes(q)) contains.push(c);
  }
  return [...starts, ...contains].slice(0, limit);
}

// ---- color distance (CIE Lab, ΔE 2000) ----

interface Lab { L: number; a: number; b: number }

export function hexToLab(hex: string): Lab {
  let v = hex.replace("#", "");
  if (v.length === 3) v = v.split("").map((c) => c + c).join("");
  const lin = (i: number) => {
    const x = parseInt(v.slice(i, i + 2), 16) / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const r = lin(0), g = lin(2), b = lin(4);
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
}

export function deltaE(p: Lab, q: Lab): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(p.a, p.b), C2 = Math.hypot(q.a, q.b), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1 = p.a * (1 + G), a2 = q.a * (1 + G);
  const c1 = Math.hypot(a1, p.b), c2 = Math.hypot(a2, q.b);
  const h = (a: number, b: number) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1 = h(a1, p.b), h2 = h(a2, q.b);
  const dL = q.L - p.L, dC = c2 - c1;
  let dh = h2 - h1;
  if (c1 * c2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * rad);
  const Lm = (p.L + q.L) / 2, cm = (c1 + c2) / 2;
  let hm = h1 + h2;
  if (c1 * c2 !== 0) hm = Math.abs(h1 - h2) > 180 ? (h1 + h2 + (h1 + h2 < 360 ? 360 : -360)) / 2 : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * cm, SH = 1 + 0.015 * cm * T;
  const RT = -2 * Math.sqrt(cm ** 7 / (cm ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

let labs: Lab[] | null = null;

/** The SW color closest to a hex color, skipping any numbers in `exclude`. */
export function nearestSw(hex: string, exclude: Iterable<string> = []): SwColor {
  labs ??= SW_COLORS.map((c) => hexToLab(c.hex));
  const skip = new Set(exclude);
  const target = hexToLab(hex);
  let best = 0, bestD = Infinity;
  for (let i = 0; i < SW_COLORS.length; i++) {
    if (skip.has(SW_COLORS[i].number)) continue;
    const d = deltaE(target, labs[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return SW_COLORS[best];
}

/** A palette entry as an SW reference: SW refs and names are tidied, hex colors become the nearest SW. */
export function toSwRef(entry: string): string {
  const s = entry.trim();
  if (/^#?[0-9a-f]{6}$|^#[0-9a-f]{3}$/i.test(s)) return swRef(nearestSw(s.startsWith("#") ? s : `#${s}`));
  const c = findSw(s);
  return c ? swRef(c) : s;
}

/** Hex for drawing a palette entry (SW ref or legacy hex). */
export function entryHex(entry: string): string {
  if (entry.startsWith("#")) return entry;
  return findSw(entry)?.hex ?? "#cccccc";
}

/** How a palette entry reads to people and to Claude: "SW 7008 Alabaster (#edeae0)". */
export function describeEntry(entry: string, withHex = true): string {
  const c = findSw(entry);
  if (!c) return entry;
  return withHex ? `${swLabel(c)} (${c.hex})` : swLabel(c);
}
