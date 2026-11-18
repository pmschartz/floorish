import { describe, expect, it } from "vitest";
import { hexToHsl, hslToHex, suggestPalettes } from "./palette";

const HEX = /^#[0-9a-f]{6}$/;

describe("color conversion", () => {
  it("round-trips hex through HSL", () => {
    for (const c of ["#2f6f5e", "#c9a227", "#ffffff", "#000000", "#7a2e3a", "#d8c3a5"]) {
      expect(hslToHex(hexToHsl(c))).toBe(c);
    }
  });
});

describe("suggestPalettes", () => {
  it("rounds out one color into three five-color palettes that keep it", () => {
    const s = suggestPalettes(["#2E5E73"], []);
    expect(s.map((p) => p.name)).toEqual(["Tonal", "Complementary", "Neutral-led"]);
    for (const p of s) {
      expect(p.colors).toHaveLength(5);
      expect(p.colors).toContain("#2e5e73");
      expect(new Set(p.colors).size).toBe(5);
      p.colors.forEach((c) => expect(c).toMatch(HEX));
      // light → dark
      const ls = p.colors.map((c) => hexToHsl(c).l);
      expect([...ls].sort((a, b) => b - a)).toEqual(ls);
    }
  });

  it("keeps both of two colors", () => {
    for (const p of suggestPalettes(["#c9a227", "#1f4e5f"], ["Mid-century modern"])) {
      expect(p.colors).toEqual(expect.arrayContaining(["#c9a227", "#1f4e5f"]));
      expect(p.colors).toHaveLength(5);
    }
  });

  it("adds an opposite-hue accent in the complementary palette", () => {
    const comp = suggestPalettes(["#2e5e73"], [])[1];
    const base = hexToHsl("#2e5e73").h;
    const gaps = comp.colors.map((c) => {
      const h = hexToHsl(c);
      const d = Math.abs(h.h - base) % 360;
      return h.s > 15 ? Math.min(d, 360 - d) : 0;
    });
    expect(Math.max(...gaps)).toBeGreaterThan(150);
  });

  it("follows the style: industrial neutrals are grayer than boho ones", () => {
    const sat = (styles: string[]) => hexToHsl(suggestPalettes(["#8f6a48"], styles)[2].colors[0]).s;
    expect(sat(["Industrial"])).toBeLessThan(sat(["Boho"]));
  });

  it("returns nothing for an empty palette", () => {
    expect(suggestPalettes([], [])).toEqual([]);
  });
});
