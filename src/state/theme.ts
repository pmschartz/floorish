import { create } from "zustand";
import { setCanvasTheme, type ResolvedTheme } from "../canvas/theme";

/** Light (Daylight), dark (Evening), or follow the computer's setting. */
export type ThemePref = "light" | "dark" | "system";

const KEY = "theme";
const read = (): ThemePref => {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
};
const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
const resolve = (pref: ThemePref): ResolvedTheme => (pref === "system" ? (media?.matches ? "dark" : "light") : pref);

function apply(theme: ResolvedTheme) {
  setCanvasTheme(theme);
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
}

export const useTheme = create<{ pref: ThemePref; theme: ResolvedTheme; setPref: (p: ThemePref) => void }>((set) => {
  const pref = read();
  const theme = resolve(pref);
  apply(theme);
  return {
    pref,
    theme,
    setPref: (p) => {
      try { localStorage.setItem(KEY, p); } catch { /* per-viewer convenience only */ }
      const t = resolve(p);
      apply(t);
      set({ pref: p, theme: t });
    },
  };
});

// Following the computer: switch when its setting changes.
media?.addEventListener("change", () => {
  const { pref } = useTheme.getState();
  if (pref !== "system") return;
  const t = resolve("system");
  apply(t);
  useTheme.setState({ theme: t });
});
