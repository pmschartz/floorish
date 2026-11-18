/**
 * Round out a one- or two-color palette into five colors using the 60-30-10 interior rule:
 * a light neutral (walls, big surfaces), a mid neutral, your color(s), an accent, and a dark
 * anchor (floors, frames, grounding pieces). Pure color theory: no API calls. The colors are
 * worked out in HSL, then each new one is matched to the nearest Sherwin-Williams color.
 */
import { entryHex, nearestSw, swRef, findSw } from "../../shared/sw";

export interface PaletteSuggestion {
  name: string;
  why: string;
  colors: string[]; // SW references ("SW 7008"), light → dark
}

interface Hsl { h: number; s: number; l: number } // h 0–360, s/l 0–100

export function hexToHsl(hex: string): Hsl {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return { h: 0, s: 0, l: 50 };
  let v = m[1];
  if (v.length === 3) v = v.split("").map((c) => c + c).join("");
  const r = parseInt(v.slice(0, 2), 16) / 255, g = parseInt(v.slice(2, 4), 16) / 255, b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex({ h, s, l }: Hsl): string {
  const hh = ((h % 360) + 360) % 360, ss = clamp(s, 0, 100) / 100, ll = clamp(l, 0, 100) / 100;
  const k = (n: number) => (n + hh / 30) % 12;
  const a = ss * Math.min(ll, 1 - ll);
  const f = (n: number) => ll - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** How each style shifts neutrals and accents. */
interface Mood {
  neutralHue: "base" | "warm" | "cool" | "sand" | "gray";
  neutralSat: number; // saturation of the neutrals
  lightL: number; // lightness of the light neutral
  anchorL: number; // lightness of the dark anchor
  accentSat: number; // multiplier on accent saturation
}

const MOODS: Record<string, Partial<Mood>> = {
  Scandinavian: { neutralHue: "cool", neutralSat: 6, lightL: 95, anchorL: 26, accentSat: 0.6 },
  Minimalist: { neutralHue: "gray", neutralSat: 3, lightL: 96, anchorL: 18, accentSat: 0.5 },
  Japandi: { neutralHue: "warm", neutralSat: 12, lightL: 92, anchorL: 22, accentSat: 0.55 },
  Industrial: { neutralHue: "gray", neutralSat: 4, lightL: 88, anchorL: 16, accentSat: 0.8 },
  Boho: { neutralHue: "warm", neutralSat: 22, lightL: 91, anchorL: 24, accentSat: 1.05 },
  "Modern farmhouse": { neutralHue: "warm", neutralSat: 14, lightL: 94, anchorL: 20, accentSat: 0.7 },
  Traditional: { neutralHue: "warm", neutralSat: 18, lightL: 90, anchorL: 20, accentSat: 0.85 },
  Coastal: { neutralHue: "sand", neutralSat: 24, lightL: 94, anchorL: 30, accentSat: 0.8 },
  "Mid-century modern": { neutralHue: "warm", neutralSat: 16, lightL: 92, anchorL: 22, accentSat: 1.25 },
  Contemporary: { neutralHue: "gray", neutralSat: 5, lightL: 94, anchorL: 18, accentSat: 0.9 },
};

const DEFAULT_MOOD: Mood = { neutralHue: "base", neutralSat: 12, lightL: 93, anchorL: 22, accentSat: 0.9 };

/** Average the moods of the chosen styles (numbers averaged; the first style picks the neutral hue). */
function moodFor(styles: string[]): Mood {
  const picked = styles.map((s) => MOODS[s]).filter(Boolean) as Partial<Mood>[];
  if (!picked.length) return DEFAULT_MOOD;
  const avg = (k: "neutralSat" | "lightL" | "anchorL" | "accentSat") =>
    picked.reduce((sum, m) => sum + (m[k] ?? DEFAULT_MOOD[k]), 0) / picked.length;
  return {
    neutralHue: picked[0].neutralHue ?? "base",
    neutralSat: avg("neutralSat"),
    lightL: avg("lightL"),
    anchorL: avg("anchorL"),
    accentSat: avg("accentSat"),
  };
}

function neutralHue(mood: Mood, base: Hsl): number {
  switch (mood.neutralHue) {
    case "warm": return 35;
    case "cool": return 210;
    case "sand": return 40;
    case "gray": return base.h;
    default: return base.h;
  }
}

const lum = (hex: string) => {
  const { l } = hexToHsl(hex);
  return l;
};

/** Hue distance on the color wheel (0–180). */
const hueGap = (a: number, b: number) => {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return Math.min(d, 360 - d);
};

/**
 * Suggestions for completing a palette of one or two colors (SW references). Each keeps your
 * colors exactly and adds the rest as Sherwin-Williams colors, ordered light to dark.
 */
export function suggestPalettes(base: string[], styles: string[]): PaletteSuggestion[] {
  return suggestHexPalettes(base.slice(0, 2).map(entryHex), styles).map((p) => {
    const used = new Set(base.map((e) => findSw(e)?.number).filter((n): n is string => !!n));
    const colors = p.colors.map((hex) => {
      const yours = base.slice(0, 2).find((e) => entryHex(e).toLowerCase() === hex);
      if (yours) return yours;
      const sw = nearestSw(hex, used);
      used.add(sw.number);
      return swRef(sw);
    });
    return { ...p, colors: colors.sort((x, y) => lum(entryHex(y)) - lum(entryHex(x))) };
  });
}

/** The same suggestions as plain hex colors, before matching to Sherwin-Williams. */
export function suggestHexPalettes(base: string[], styles: string[]): PaletteSuggestion[] {
  const mine = base.slice(0, 2).map((c) => c.toLowerCase());
  if (mine.length === 0) return [];
  const mood = moodFor(styles);
  const b = hexToHsl(mine[0]);
  // A nearly gray base color has no hue to work from; lean on the mood's neutral hue.
  const baseHue = b.s < 8 ? neutralHue({ ...mood, neutralHue: mood.neutralHue === "base" ? "warm" : mood.neutralHue }, b) : b.h;
  const nh = neutralHue(mood, { ...b, h: baseHue });
  const ns = mood.neutralHue === "gray" ? Math.min(mood.neutralSat, 5) : mood.neutralSat;
  const accentS = clamp(Math.max(b.s, 35) * mood.accentSat, 15, 75);

  const light = hslToHex({ h: nh, s: ns, l: mood.lightL });
  const mid = hslToHex({ h: nh, s: ns + 4, l: 72 });
  const anchor = hslToHex({ h: baseHue, s: clamp(b.s * 0.45, 8, 30), l: mood.anchorL });

  const build = (extra: string[]) => {
    // Your colors plus the extras, five in all, without near-duplicates, light → dark.
    const out: string[] = [...mine];
    // Spare neutral steps, used only if the extras were too close to each other or to yours.
    const spare = [84, 60, 48, 36, 88, 66].map((l) => hslToHex({ h: nh, s: ns + 2, l }));
    for (const c of [...extra, ...spare]) {
      if (out.length >= 5) break;
      const h = hexToHsl(c);
      const close = out.some((o) => {
        const p = hexToHsl(o);
        return Math.abs(p.l - h.l) < 6 && (hueGap(p.h, h.h) < 12 || (p.s < 10 && h.s < 10));
      });
      if (!close) out.push(c);
    }
    return out.sort((x, y) => lum(y) - lum(x));
  };

  const tonalAccent = hslToHex({ h: baseHue + (b.l > 55 ? -28 : 28), s: accentS, l: clamp(b.l + (b.l > 55 ? -18 : 14), 30, 70) });
  const complement = hslToHex({ h: baseHue + 180, s: clamp(accentS * 0.85, 15, 65), l: clamp(100 - b.l, 35, 60) });
  const softBase = hslToHex({ h: baseHue, s: clamp(b.s * 0.5, 8, 40), l: clamp(b.l + 22, 60, 88) });

  const two = mine.length === 2;
  return [
    {
      name: "Tonal",
      why: two ? "Your two colors with soft neutrals and a deep anchor: calm and cohesive." : "Neighbouring hues for a calm, layered room; your color stays the star.",
      colors: build([light, two ? mid : tonalAccent, anchor, mid, tonalAccent]),
    },
    {
      name: "Complementary",
      why: "Adds the opposite hue as a small accent (pillows, art, a lamp) for contrast that pops.",
      colors: build([light, complement, anchor, mid, softBase]),
    },
    {
      name: "Neutral-led",
      why: "Mostly neutrals with your color as the one pop: easy to live with, easy to change.",
      colors: build([light, mid, softBase, anchor, hslToHex({ h: nh, s: ns, l: 82 })]),
    },
  ];
}
